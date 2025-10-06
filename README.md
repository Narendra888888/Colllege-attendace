# College Attendance Management System

A web-based attendance management system for colleges with Excel import functionality.

## Features

- 📊 **Student Management**: Upload student data via Excel files
- 📅 **Attendance Tracking**: Mark attendance for specific dates
- 📈 **Real-time Statistics**: View present/absent counts and percentages
- 📋 **Attendance History**: Track attendance records over time
- 📊 **Data Visualization**: Charts and graphs for attendance analysis

## Project Structure

```
College Attendance System/
├── backend/
│   ├── server.js          # Express.js server
│   ├── package.json       # Backend dependencies
│   ├── attendance.db      # SQLite database
│   └── uploads/           # Excel file uploads
├── frontend/
│   ├── index.html         # Main HTML page
│   ├── script.js          # Frontend JavaScript
│   └── styles.css         # Custom CSS styles
└── README.md              # This file
```

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm

### Backend Setup
```bash
cd backend
npm install
npm start
```

### Frontend
The frontend is served automatically by the backend server at `http://localhost:3000`

## Usage

1. **Upload Student Data**: Use the Excel upload feature to add student information
2. **Select Date**: Choose the date for attendance marking
3. **Mark Attendance**: Click Present/Absent buttons for each student
4. **Submit**: Click "Submit Attendance" to save the data
5. **View Reports**: Check attendance history and statistics

## API Endpoints

- `GET /api/students` - Get all students
- `POST /api/students/upload` - Upload Excel file with student data
- `GET /api/attendance/:date` - Get attendance for specific date
- `POST /api/attendance/bulk` - Submit bulk attendance data
- `GET /api/attendance/history` - Get attendance history
- `GET /api/attendance/:date/summary` - Get attendance summary for date

## Technologies Used

- **Backend**: Node.js, Express.js, SQLite3
- **Frontend**: HTML5, CSS3, JavaScript (ES6+), Bootstrap 5
- **File Processing**: Multer, XLSX
- **Charts**: Chart.js

## License

MIT License
