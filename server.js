const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

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
}

// Routes

// Get all students
app.get('/api/students', (req, res) => {
    db.all('SELECT * FROM students ORDER BY roll_no', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Add student
app.post('/api/students', (req, res) => {
    const { roll_no, name, email } = req.body;
    
    db.run('INSERT INTO students (roll_no, name, email) VALUES (?, ?, ?)', 
           [roll_no, name, email], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, roll_no, name, email });
    });
});

// Bulk upload students from Excel
app.post('/api/students/upload', upload.single('excel'), (req, res) => {
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

        // Process data rows
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row[rollNoIndex] && row[nameIndex]) {
                students.push({
                    roll_no: row[rollNoIndex].toString(),
                    name: row[nameIndex].toString(),
                    email: row[emailIndex] ? row[emailIndex].toString() : ''
                });
            }
        }

        // Insert students into database
        const stmt = db.prepare('INSERT OR REPLACE INTO students (roll_no, name, email) VALUES (?, ?, ?)');
        
        students.forEach(student => {
            stmt.run([student.roll_no, student.name, student.email]);
        });
        
        stmt.finalize();

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({ 
            message: `Successfully uploaded ${students.length} students`,
            count: students.length,
            students: students
        });

    } catch (error) {
        // Clean up uploaded file
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// Get attendance for a specific date
app.get('/api/attendance/:date', (req, res) => {
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
app.post('/api/attendance', (req, res) => {
    const { student_id, date, status } = req.body;
    
    db.run(`
        INSERT OR REPLACE INTO attendance (student_id, date, status) 
        VALUES (?, ?, ?)
    `, [student_id, date, status], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, student_id, date, status });
    });
});

// Get attendance summary for a date
app.get('/api/attendance/:date/summary', (req, res) => {
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

// Get attendance history
app.get('/api/attendance/history', (req, res) => {
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

// Get student attendance statistics
app.get('/api/students/:id/attendance', (req, res) => {
    const studentId = req.params.id;
    
    db.all(`
        SELECT date, status 
        FROM attendance 
        WHERE student_id = ? 
        ORDER BY date DESC
    `, [studentId], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const presentCount = rows.filter(r => r.status === 'present').length;
        const totalCount = rows.length;
        const percentage = totalCount > 0 ? (presentCount / totalCount * 100).toFixed(2) : 0;
        
        res.json({
            records: rows,
            present_count: presentCount,
            total_count: totalCount,
            percentage: percentage
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
    return 0;
}

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
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

