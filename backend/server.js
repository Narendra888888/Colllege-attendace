const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const os = require('os');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
}));
app.use(passport.initialize());
app.use(passport.session());

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Initialize SQLite database
const db = new sqlite3.Database('attendance.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    // Students table
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_no TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Attendance table
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students (id),
        UNIQUE(student_id, date)
    )`);

    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
    )`);
}

// Passport configuration
// TODO: Replace with your actual Google Cloud project credentials
// 1. Go to https://console.cloud.google.com/apis/credentials
// 2. Create an OAuth 2.0 Client ID for a Web application.
// 3. Set the "Authorized JavaScript origins" to your server's address (e.g., http://localhost:3000)
// 4. Set the "Authorized redirect URIs" to http://localhost:3000/auth/google/callback
// 5. Copy the Client ID and Client Secret below.
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID, // Use environment variable
    clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Use environment variable
    callbackURL: '/auth/google/callback'
},
    function (accessToken, refreshToken, profile, done) {
        const { id, displayName, emails } = profile;
        const email = emails[0].value;

        db.get('SELECT * FROM users WHERE google_id = ?', [id], (err, user) => {
            if (err) {
                return done(err);
            }
            if (!user) {
                db.run('INSERT INTO users (google_id, name, email) VALUES (?, ?, ?)', [id, displayName, email], (err) => {
                    if (err) {
                        return done(err);
                    }
                    db.get('SELECT * FROM users WHERE google_id = ?', [id], (err, newUser) => {
                        return done(err, newUser);
                    });
                });
            } else {
                return done(null, user);
            }
        });
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        done(err, user);
    });
});

// Routes
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
    });

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

app.get('/logout', (req, res) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/login');
      });
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json(req.user);
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

// Middleware to protect routes
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// The main application route, protected
app.get('/', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});


// Get all students
app.get('/api/students', ensureAuthenticated, (req, res) => {
    db.all('SELECT * FROM students ORDER BY roll_no', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Add student
app.post('/api/students', ensureAuthenticated, (req, res) => {
    const { roll_no, name, email } = req.body;

    db.run('INSERT INTO students (roll_no, name, email) VALUES (?, ?, ?)',
        [roll_no, name, email], function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, roll_no, name, email });
        });
});

// Upload Excel file and process students
app.post('/api/students/upload', ensureAuthenticated, upload.single('excel'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const students = [];
        const headers = data[0];

        // Find column indices
        const rollNoIndex = findColumnIndex(headers, ['roll', 'id', 'number', 'no']);
        const nameIndex = findColumnIndex(headers, ['name', 'student', 'full']);
        const emailIndex = findColumnIndex(headers, ['email', 'mail', 'contact']);

        if (rollNoIndex === -1 || nameIndex === -1) {
            return res.status(400).json({ error: 'Required columns (Roll No, Name) not found in the Excel file.' });
        }

        // Process data rows
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row[rollNoIndex] && row[nameIndex]) {
                students.push({
                    roll_no: row[rollNoIndex].toString(),
                    name: row[nameIndex].toString(),
                    email: emailIndex !== -1 && row[emailIndex] ? row[emailIndex].toString() : ''
                });
            }
        }

        // Insert students into database
        const stmt = db.prepare('INSERT OR IGNORE INTO students (roll_no, name, email) VALUES (?, ?, ?)');

        let changes = 0;
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            students.forEach(student => {
                stmt.run([student.roll_no, student.name, student.email], function (err) {
                    if (err) {
                        console.error('Error inserting student:', err.message);
                    } else {
                        if (this.changes > 0) {
                            changes++;
                        }
                    }
                });
            });
            db.run('COMMIT');
        });

        stmt.finalize((err) => {
            if (err) {
                console.error('Error finalizing statement:', err.message);
            }
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);

            res.json({
                message: `Successfully processed file. Added ${changes} new students.`,
                count: changes,
                students: students
            });
        });

    } catch (error) {
        // Clean up uploaded file
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// Delete student
app.delete('/api/students/:id', ensureAuthenticated, (req, res) => {
    const studentId = req.params.id;

    db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to start transaction: ' + err.message });
        }

        db.run('DELETE FROM attendance WHERE student_id = ?', [studentId], function(err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to delete attendance records: ' + err.message });
            }

            db.run('DELETE FROM students WHERE id = ?', [studentId], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to delete student: ' + err.message });
                }

                if (this.changes === 0) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: 'Student not found' });
                }

                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to commit transaction: ' + err.message });
                    }
                    return res.json({ message: 'Student deleted successfully' });
                });
            });
        });
    });
});

// Helper function to find column index
function findColumnIndex(headers, possibleNames) {
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toString().toLowerCase();
        for (const name of possibleNames) {
            if (header.includes(name.toLowerCase())) {
                return i;
            }
        }
    }
    return -1;
}

// Get attendance history (must come before /api/attendance/:date)
app.get('/api/attendance/history', ensureAuthenticated, (req, res) => {
    db.all(`
        SELECT
            date,
            COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
            COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
            COUNT(*) as total_count
        FROM attendance
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get attendance for a specific date
app.get('/api/attendance/:date', ensureAuthenticated, (req, res) => {
    const date = req.params.date;

    db.all(`
        SELECT s.id, s.roll_no, s.name, s.email, a.status
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
        ORDER BY s.roll_no
    `, [date], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Mark attendance
app.post('/api/attendance', ensureAuthenticated, (req, res) => {
    const { student_id, date, status } = req.body;

    db.run(`
        INSERT OR REPLACE INTO attendance (student_id, date, status)
        VALUES (?, ?, ?)
    `, [student_id, date, status], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, student_id, date, status });
    });
});

// Bulk mark attendance
app.post('/api/attendance/bulk', ensureAuthenticated, (req, res) => {
    const { records } = req.body;

    if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO attendance (student_id, date, status)
        VALUES (?, ?, ?)
    `);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        try {
            records.forEach(record => {
                if (record.student_id && record.date && record.status) {
                    stmt.run(record.student_id, record.date, record.status);
                }
            });
            db.run('COMMIT', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ message: 'Attendance submitted successfully' });
                }
                stmt.finalize();
            });
        } catch (err) {
            db.run('ROLLBACK');
            stmt.finalize();
            res.status(500).json({ error: err.message });
        }
    });
});

// Get attendance summary for a date
app.get('/api/attendance/:date/summary', ensureAuthenticated, (req, res) => {
    const date = req.params.date;

    db.get(`
        SELECT
            COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
            COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
            COUNT(*) as total_count
        FROM attendance
        WHERE date = ?
    `, [date], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row);
    });
});

// Delete a single attendance record
app.delete('/api/attendance/:id', ensureAuthenticated, (req, res) => {
    const attendanceId = req.params.id;
    db.run('DELETE FROM attendance WHERE id = ?', [attendanceId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: 'Attendance record not found' });
        } else {
            res.json({ message: 'Attendance record deleted successfully' });
        }
    });
});

// Clear all attendance history
app.delete('/api/attendance/all', ensureAuthenticated, (req, res) => {
    db.run('DELETE FROM attendance', function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: `Deleted ${this.changes} attendance records.` });
    });
});

// Delete attendance records for a specific date
app.delete('/api/attendance/date/:date', ensureAuthenticated, (req, res) => {
    const date = req.params.date;
    db.run('DELETE FROM attendance WHERE date = ?', [date], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: `No attendance records found for date ${date}` });
        } else {
            res.json({ message: `Deleted ${this.changes} attendance records for date ${date}` });
        }
    });
});

function getNetworkIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '0.0.0.0';
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    const ip = getNetworkIp();
    console.log(`Server is running on:`);
    console.log(`- Local: http://localhost:${PORT}`);
    console.log(`- Network: http://${ip}:${PORT}`);
    console.log(`- Access from other devices on same WiFi`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});