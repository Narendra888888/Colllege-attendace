document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/user')
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                window.location.href = '/login';
            }
        })
        .then(user => {
            if (user) {
                document.getElementById('main-content').style.display = 'block';
                attendanceManager = new AttendanceManager();
            } else {
                window.location.href = '/login';
            }
        })
        .catch(() => {
            window.location.href = '/login';
        });
});

// College Attendance Management System JavaScript

class AttendanceManager {
    constructor() {
        this.students = [];
        this.stagedAttendance = new Map();
        this.currentDate = new Date().toISOString().split('T')[0];
        this.init();
    }

    init() {
        document.getElementById('attendanceDate').value = this.currentDate;
        // this.loadAttendanceForDate(); // Removed to prevent auto-loading
        this.renderStudentTable(); // Render empty table initially
        this.loadAttendanceHistory();
        this.initChart();
    }

    async uploadExcel(event) {
        const fileInput = document.getElementById('excelFile');
        const file = fileInput.files[0];

        if (!file) {
            this.showAlert('Please select an Excel file first.', 'danger');
            return;
        }

        const formData = new FormData();
        formData.append('excel', file);

        const uploadButton = event.target;

        try {
            this.showLoading(true, uploadButton);
            const response = await fetch('/api/students/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to upload file');
            }

            const result = await response.json();
            this.showAlert(result.message, 'success');
            await this.loadStudents(); // Reload students after upload
            this.renderStudentTable();
            this.updateAttendanceSummary();

        } catch (error) {
            this.showAlert('Error uploading file: ' + error.message, 'danger');
        } finally {
            this.showLoading(false, uploadButton);
        }
    }


    async loadStudents() {
        try {
            const response = await fetch('/api/students');
            if (!response.ok) {
                throw new Error('Failed to fetch students');
            }
            this.students = await response.json();
        } catch (error) {
            this.showAlert(error.message, 'danger');
        }
    }

    async loadAttendanceForDate() {
        const selectedDate = document.getElementById('attendanceDate').value;
        if (!selectedDate) return;

        this.currentDate = selectedDate;
        this.stagedAttendance.clear();

        try {
            const response = await fetch(`/api/attendance/${this.currentDate}`);
            if (!response.ok) {
                throw new Error('Failed to load attendance data');
            }
            const data = await response.json();
            
            this.students = data;
            this.renderStudentTable();
            this.updateAttendanceSummary();

        } catch (error) {
            this.showAlert(error.message, 'danger');
        }
    }

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
            const stagedStatus = this.stagedAttendance.get(student.id);
            const attendanceStatus = stagedStatus || student.status || 'pending';
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${student.roll_no}</td>
                <td>${student.name}</td>
                <td>
                    <span class="status-${attendanceStatus}" id="status-${student.id}">
                        ${this.getStatusText(attendanceStatus)}
                    </span>
                </td>
                <td>
                    <button class="btn btn-success btn-sm attendance-button me-1" 
                            id="present-btn-${student.id}"
                            onclick="attendanceManager.stageAttendance(${student.id}, 'present')"
                            ${attendanceStatus === 'present' ? 'disabled' : ''}>
                        <i class="fas fa-check me-1"></i>Present
                    </button>
                    <button class="btn btn-danger btn-sm attendance-button" 
                            id="absent-btn-${student.id}"
                            onclick="attendanceManager.stageAttendance(${student.id}, 'absent')"
                            ${attendanceStatus === 'absent' ? 'disabled' : ''}>
                        <i class="fas fa-times me-1"></i>Absent
                    </button>
                    <button class="btn btn-outline-danger btn-sm ms-2" onclick="attendanceManager.deleteStudent(${student.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    stageAttendance(studentId, status) {
        this.stagedAttendance.set(studentId, status);
        this.renderStudentTable();
    }

    async submitAttendance(event) {
        if (this.stagedAttendance.size === 0) {
            this.showAlert('No changes to submit.', 'info');
            return;
        }

        if (!this.currentDate) {
            this.showAlert('Please select a date first.', 'warning');
            return;
        }

        const records = [];
        for (const [studentId, status] of this.stagedAttendance.entries()) {
            if (studentId && status) {
                records.push({
                    student_id: studentId,
                    date: this.currentDate,
                    status: status
                });
            }
        }

        if (records.length === 0) {
            this.showAlert('No valid records to submit.', 'warning');
            return;
        }

        const submitButton = event.target;

        try {
            this.showLoading(true, submitButton);
            const response = await fetch('/api/attendance/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: records })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to submit attendance');
            }

            this.showAlert('Attendance submitted successfully!', 'success');
            this.stagedAttendance.clear();
            await this.loadAttendanceForDate(); // Reload data
            await this.loadAttendanceHistory();

        } catch (error) {
            console.error('Submit attendance error:', error);
            this.showAlert('Error submitting attendance: ' + error.message, 'danger');
        } finally {
            this.showLoading(false, submitButton);
        }
    }

    async deleteStudent(studentId) {
        if (!confirm('Are you sure you want to delete this student?')) {
            return;
        }

        try {
            const response = await fetch(`/api/students/${studentId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete student');
            }

            this.showAlert('Student deleted successfully', 'success');
            await this.loadAttendanceForDate();

        } catch (error) {
            this.showAlert('Error deleting student: ' + error.message, 'danger');
        }
    }

    markAllPresent() {
        if (this.students.length === 0) {
            this.showAlert('No students found. Please upload an Excel file first.', 'warning');
            return;
        }

        this.students.forEach(student => {
            this.stageAttendance(student.id, 'present');
        });
        this.showAlert('All students staged as present. Click "Submit Attendance" to save.', 'info');
    }

    markAbsentees() {
        const absentRollsInput = document.getElementById('absentRollNumbers');
        const absentRolls = absentRollsInput.value.trim();

        if (!absentRolls) {
            this.showAlert('Please enter the last digits of absent students\' roll numbers.', 'warning');
            return;
        }

        if (this.students.length === 0) {
            this.showAlert('No students loaded to mark attendance against.', 'warning');
            return;
        }

        const absentRollNumberEndsWith = absentRolls.split(',').map(r => r.trim()).filter(r => r);

        let absentCount = 0;
        let presentCount = 0;

        this.students.forEach(student => {
            const isAbsent = absentRollNumberEndsWith.some(absentRoll => student.roll_no.endsWith(absentRoll));
            if (isAbsent) {
                this.stageAttendance(student.id, 'absent');
                absentCount++;
            } else {
                this.stageAttendance(student.id, 'present');
                presentCount++;
            }
        });

        absentRollsInput.value = ''; // Clear the textarea
        this.showAlert(`Staged ${absentCount} student(s) as absent and ${presentCount} as present. Click "Submit Attendance" to save.`, 'info');
    }

    getStatusText(status) {
        switch (status) {
            case 'present': return 'Present';
            case 'absent': return 'Absent';
            default: return 'Pending';
        }
    }

    async updateAttendanceSummary() {
        try {
            const response = await fetch(`/api/attendance/${this.currentDate}/summary`);
            if (!response.ok) {
                throw new Error('Failed to load summary');
            }
            const summary = await response.json();
            document.getElementById('presentCount').textContent = summary.present_count || 0;
            document.getElementById('absentCount').textContent = summary.absent_count || 0;
            document.getElementById('totalCount').textContent = this.students.length;
            this.updateChart(summary.present_count || 0, summary.absent_count || 0);
        } catch (error) {
            // Don't show alert, just fail silently for summary
            console.error(error);
        }
    }

    async loadAttendanceHistory() {
        const tbody = document.getElementById('attendanceHistory');
        tbody.innerHTML = '';

        try {
            const response = await fetch('/api/attendance/history');
            if (!response.ok) {
                throw new Error('Failed to load history');
            }
            const history = await response.json();

            if (history.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted">No attendance records found</td>
                    </tr>
                `;
                return;
            }

            history.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${this.formatDate(record.date || '')}</td>
                    <td><span class="badge bg-success">${record.present_count || 0}</span></td>
                    <td><span class="badge bg-danger">${record.absent_count || 0}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="attendanceManager.deleteAttendanceRecord('${record.date}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            this.showAlert(error.message, 'danger');
        }
    }

    async deleteAttendanceRecord(date) {
        if (!confirm(`Are you sure you want to delete attendance for ${this.formatDate(date)}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/attendance/date/${date}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete attendance record');
            }

            this.showAlert('Attendance record deleted successfully', 'success');
            this.loadAttendanceHistory();
            this.loadAttendanceForDate(); // Refresh current date attendance if it was deleted
        } catch (error) {
            this.showAlert('Error deleting attendance record: ' + error.message, 'danger');
        }
    }

    async clearAllAttendanceHistory() {
        if (!confirm('Are you sure you want to delete ALL attendance history? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch('/api/attendance/all', {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to clear all attendance history');
            }

            this.showAlert('All attendance history cleared successfully', 'success');
            this.loadAttendanceHistory();
            this.loadAttendanceForDate(); // Clear current date attendance
        } catch (error) {
            this.showAlert('Error clearing attendance history: ' + error.message, 'danger');
        }
    }

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
    }

    updateChart(presentCount, absentCount) {
        if (this.chart) {
            this.chart.data.datasets[0].data = [presentCount, absentCount];
            this.chart.update();
        }
    }

    showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);

        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    showLoading(show, button = null) {
        if (button) {
            if (show) {
                button.disabled = true;
                button.classList.add('loading');
            } else {
                button.disabled = false;
                button.classList.remove('loading');
            }
        } else {
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                if (show) {
                    btn.disabled = true;
                    btn.classList.add('loading');
                } else {
                    btn.disabled = false;
                    btn.classList.remove('loading');
                }
            });
        }
    }

    formatDate(dateString) {
        // Handles YYYY-MM-DD format from database
        if (!dateString) {
            return 'Invalid Date';
        }
        
        try {
            // Simple YYYY-MM-DD format handling
            const date = new Date(dateString);
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }
            
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            console.error('Error formatting date:', error, 'dateString:', dateString);
            return 'Invalid Date';
        }
    }

    speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(utterance);
    }

    activateVoiceAssistant() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.showAlert('Speech recognition is not supported in your browser.', 'danger');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        const voiceBtn = document.getElementById('voice-assistant-btn');
        voiceBtn.disabled = true;
        voiceBtn.innerHTML = '<i class="fas fa-microphone-alt me-2"></i> Listening...';

        recognition.start();

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript.toLowerCase();
            this.processVoiceCommand(speechResult);
        };

        recognition.onspeechend = () => {
            recognition.stop();
            voiceBtn.disabled = false;
            voiceBtn.innerHTML = '<i class="fas fa-microphone-alt me-2"></i> Voice Command';
        };

        recognition.onerror = (event) => {
            this.showAlert(`Error occurred in recognition: ${event.error}`, 'danger');
            voiceBtn.disabled = false;
            voiceBtn.innerHTML = '<i class="fas fa-microphone-alt me-2"></i> Voice Command';
        };
    }

    processVoiceCommand(command) {
        console.log('Recognized command:', command);

        const wordToDigit = {
            'zero': '0', 'one': '1', 'two': '2', 'to': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
        };

        const commandParts = command.split(' ');
        let spokenNumber = null;
        let status = null;

        for (const part of commandParts) {
            if (!isNaN(parseInt(part))) {
                spokenNumber = part;
            } else if (wordToDigit[part]) {
                spokenNumber = wordToDigit[part];
            }

            const cleanPart = part.replace(/[^a-zA-Z]/g, '');
            if (cleanPart === 'present' || cleanPart === 'absent') {
                status = cleanPart;
            }
        }

        console.log('Spoken Number:', spokenNumber);
        console.log('Status:', status);

        if (spokenNumber && status) {
            const student = this.students.find(s => s.roll_no.endsWith(spokenNumber));
            if (student) {
                const buttonId = `${status}-btn-${student.id}`;
                const button = document.getElementById(buttonId);
                if (button) {
                    button.classList.add('btn-voice-activated');
                    setTimeout(() => {
                        this.stageAttendance(student.id, status);
                        this.speak(`Roll number ending in ${spokenNumber} marked as ${status}.`);
                        button.classList.remove('btn-voice-activated');
                    }, 500);
                } else {
                    this.stageAttendance(student.id, status);
                    this.speak(`Roll number ending in ${spokenNumber} marked as ${status}.`);
                }
            } else {
                this.speak(`Sorry, I couldn\'t find a student with a roll number ending in ${spokenNumber}.`);
            }
        } else if (command.includes('mark all present')) {
            this.markAllPresent();
            this.speak('All students have been marked as present.');
        } else if (command.includes('submit attendance')) {
            this.submitAttendance({target: document.querySelector('#submit-attendance-btn')});
            this.speak('Submitting attendance.');
        } else {
            this.speak("please say it again");
        }
    }
}


// Global functions for HTML onclick events
function uploadExcel(event) {
    attendanceManager.uploadExcel(event);
}

function loadAttendanceForDate() {
    attendanceManager.loadAttendanceForDate();
}

function markAllPresent() {
    attendanceManager.markAllPresent();
}

function markAbsentees() {
    attendanceManager.markAbsentees();
}

function submitAttendance(event) {
    attendanceManager.submitAttendance(event);
}

function deleteStudent(studentId) {
    attendanceManager.deleteStudent(studentId);
}

// Global instance of AttendanceManager, initialized after authentication
let attendanceManager;
