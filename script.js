// College Attendance Management System JavaScript

class AttendanceManager {
    constructor() {
        this.students = [];
        this.attendanceRecords = JSON.parse(localStorage.getItem('attendanceRecords')) || {};
        this.currentDate = new Date().toISOString().split('T')[0];
        this.init();
    }

    init() {
        // Set today's date in the date picker
        document.getElementById('attendanceDate').value = this.currentDate;
        
        // Load attendance for today
        this.loadAttendanceForDate();
        
        // Load attendance history
        this.loadAttendanceHistory();
        
        // Initialize chart
        this.initChart();
    }

    // Upload and process Excel file
    async uploadExcel() {
        const fileInput = document.getElementById('excelFile');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showAlert('Please select an Excel file first.', 'danger');
            return;
        }

        try {
            this.showLoading(true);
            
            const data = await this.readExcelFile(file);
            this.students = this.processStudentData(data);
            
            // Save to localStorage
            localStorage.setItem('students', JSON.stringify(this.students));
            
            this.showAlert(`Successfully uploaded ${this.students.length} students.`, 'success');
            this.loadAttendanceForDate();
            
        } catch (error) {
            this.showAlert('Error processing Excel file: ' + error.message, 'danger');
        } finally {
            this.showLoading(false);
        }
    }

    // Read Excel file using SheetJS
    readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsArrayBuffer(file);
        });
    }

    // Process student data from Excel
    processStudentData(data) {
        const students = [];
        const headers = data[0];
        
        // Expected columns: Roll No, Name, Email (adjust as needed)
        const rollNoIndex = this.findColumnIndex(headers, ['roll', 'id', 'number', 'no']);
        const nameIndex = this.findColumnIndex(headers, ['name', 'student', 'full']);
        const emailIndex = this.findColumnIndex(headers, ['email', 'mail', 'contact']);
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row[rollNoIndex] && row[nameIndex]) {
                students.push({
                    id: Date.now() + i,
                    rollNo: row[rollNoIndex].toString(),
                    name: row[nameIndex].toString(),
                    email: row[emailIndex] ? row[emailIndex].toString() : '',
                    attendance: {} // Will store date-wise attendance
                });
            }
        }
        
        return students;
    }

    // Find column index by possible header names
    findColumnIndex(headers, possibleNames) {
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toString().toLowerCase();
            for (const name of possibleNames) {
                if (header.includes(name.toLowerCase())) {
                    return i;
                }
            }
        }
        return 0; // Default to first column
    }

    // Load students from localStorage
    loadStudents() {
        const savedStudents = localStorage.getItem('students');
        if (savedStudents) {
            this.students = JSON.parse(savedStudents);
        }
        return this.students;
    }

    // Load attendance for selected date
    loadAttendanceForDate() {
        const selectedDate = document.getElementById('attendanceDate').value;
        if (!selectedDate) return;

        // Load students if not already loaded
        if (this.students.length === 0) {
            this.loadStudents();
        }

        this.currentDate = selectedDate;
        this.renderStudentTable();
        this.updateAttendanceSummary();
    }

    // Render student table
    renderStudentTable() {
        const tbody = document.getElementById('studentTableBody');
        tbody.innerHTML = '';

        if (this.students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <i class="fas fa-upload me-2"></i>
                        No students found. Please upload an Excel file first.
                    </td>
                </tr>
            `;
            return;
        }

        this.students.forEach(student => {
            const attendanceStatus = this.getAttendanceStatus(student.id, this.currentDate);
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${student.rollNo}</td>
                <td>${student.name}</td>
                <td>${student.email}</td>
                <td>
                    <span class="status-${attendanceStatus}" id="status-${student.id}">
                        ${this.getStatusText(attendanceStatus)}
                    </span>
                </td>
                <td>
                    <button class="btn btn-success btn-sm attendance-button me-1" 
                            onclick="attendanceManager.markPresent(${student.id})"
                            ${attendanceStatus === 'present' ? 'disabled' : ''}>
                        <i class="fas fa-check me-1"></i>Present
                    </button>
                    <button class="btn btn-danger btn-sm attendance-button" 
                            onclick="attendanceManager.markAbsent(${student.id})"
                            ${attendanceStatus === 'absent' ? 'disabled' : ''}>
                        <i class="fas fa-times me-1"></i>Absent
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    // Mark student as present
    markPresent(studentId) {
        this.updateAttendance(studentId, 'present');
        this.renderStudentTable();
        this.updateAttendanceSummary();
        this.saveAttendanceRecords();
    }

    // Mark student as absent
    markAbsent(studentId) {
        this.updateAttendance(studentId, 'absent');
        this.renderStudentTable();
        this.updateAttendanceSummary();
        this.saveAttendanceRecords();
    }

    // Mark all students as present
    markAllPresent() {
        if (this.students.length === 0) {
            this.showAlert('No students found. Please upload an Excel file first.', 'warning');
            return;
        }

        this.students.forEach(student => {
            this.updateAttendance(student.id, 'present');
        });
        
        this.renderStudentTable();
        this.updateAttendanceSummary();
        this.saveAttendanceRecords();
        this.showAlert('All students marked as present.', 'success');
    }

    // Update attendance for a student
    updateAttendance(studentId, status) {
        if (!this.attendanceRecords[this.currentDate]) {
            this.attendanceRecords[this.currentDate] = {};
        }
        this.attendanceRecords[this.currentDate][studentId] = status;
    }

    // Get attendance status for a student
    getAttendanceStatus(studentId, date) {
        return this.attendanceRecords[date]?.[studentId] || 'pending';
    }

    // Get status text
    getStatusText(status) {
        switch (status) {
            case 'present': return 'Present';
            case 'absent': return 'Absent';
            default: return 'Pending';
        }
    }

    // Update attendance summary
    updateAttendanceSummary() {
        const presentCount = this.getAttendanceCount('present');
        const absentCount = this.getAttendanceCount('absent');
        const totalCount = this.students.length;

        document.getElementById('presentCount').textContent = presentCount;
        document.getElementById('absentCount').textContent = absentCount;
        document.getElementById('totalCount').textContent = totalCount;
    }

    // Get count of students with specific status
    getAttendanceCount(status) {
        if (!this.attendanceRecords[this.currentDate]) return 0;
        
        return Object.values(this.attendanceRecords[this.currentDate])
                   .filter(s => s === status).length;
    }

    // Load attendance history
    loadAttendanceHistory() {
        const tbody = document.getElementById('attendanceHistory');
        tbody.innerHTML = '';

        const dates = Object.keys(this.attendanceRecords).sort((a, b) => b.localeCompare(a));
        
        if (dates.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted">No attendance records found</td>
                </tr>
            `;
            return;
        }

        dates.slice(0, 10).forEach(date => { // Show last 10 records
            const record = this.attendanceRecords[date];
            const present = Object.values(record).filter(s => s === 'present').length;
            const absent = Object.values(record).filter(s => s === 'absent').length;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.formatDate(date)}</td>
                <td><span class="badge bg-success">${present}</span></td>
                <td><span class="badge bg-danger">${absent}</span></td>
            `;
            tbody.appendChild(row);
        });
    }

    // Initialize attendance chart
    initChart() {
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#198754', '#dc3545'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        
        this.updateChart();
    }

    // Update chart with current data
    updateChart() {
        if (this.chart) {
            const presentCount = this.getAttendanceCount('present');
            const absentCount = this.getAttendanceCount('absent');
            
            this.chart.data.datasets[0].data = [presentCount, absentCount];
            this.chart.update();
        }
    }

    // Save attendance records to localStorage
    saveAttendanceRecords() {
        localStorage.setItem('attendanceRecords', JSON.stringify(this.attendanceRecords));
        this.loadAttendanceHistory();
        this.updateChart();
    }

    // Show alert message
    showAlert(message, type) {
        // Remove existing alerts
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());

        // Create new alert
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Insert at the top of the container
        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);

        // Auto dismiss after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // Show/hide loading state
    showLoading(show) {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            if (show) {
                button.disabled = true;
                button.classList.add('loading');
            } else {
                button.disabled = false;
                button.classList.remove('loading');
            }
        });
    }

    // Format date for display
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Global functions for HTML onclick events
function uploadExcel() {
    attendanceManager.uploadExcel();
}

function loadAttendanceForDate() {
    attendanceManager.loadAttendanceForDate();
}

function markAllPresent() {
    attendanceManager.markAllPresent();
}

// Initialize the attendance manager when page loads
let attendanceManager;
document.addEventListener('DOMContentLoaded', function() {
    attendanceManager = new AttendanceManager();
});

