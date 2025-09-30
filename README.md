# College Attendance Management System

A modern web-based attendance management system for colleges that allows you to upload student data from Excel files and manage daily attendance with present/absent buttons.

## Features

- 📊 **Excel Import**: Upload student data from Excel files (.xlsx, .xls)
- 👥 **Student Management**: View and manage student information
- ✅ **Attendance Tracking**: Mark students as present or absent
- 📅 **Date-wise Attendance**: Track attendance for different dates
- 📈 **Statistics**: View attendance summaries and charts
- 💾 **Data Persistence**: Data is saved locally using SQLite database
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Installation

1. **Clone or download** this project to your computer
2. **Install Node.js** (version 14 or higher) from [nodejs.org](https://nodejs.org/)
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the server**:
   ```bash
   npm start
   ```
5. **Open your browser** and go to `http://localhost:3000`

## How to Use

### 1. Prepare Excel File
Create an Excel file with student data in the following format:

| Roll No | Name | Email |
|---------|------|-------|
| 001 | John Doe | john@example.com |
| 002 | Jane Smith | jane@example.com |
| 003 | Bob Johnson | bob@example.com |

**Important**: 
- First row should contain headers (Roll No, Name, Email)
- The system will automatically detect columns with names like "roll", "name", "email"
- Make sure Roll No and Name columns have data for all students

### 2. Upload Students
1. Click on "Choose File" and select your Excel file
2. Click "Upload & Process" button
3. The system will import all students and display them in the table

### 3. Mark Attendance
1. Select the date for attendance (defaults to today)
2. For each student, click:
   - **Present** button to mark as present
   - **Absent** button to mark as absent
3. Use "Mark All Present" to quickly mark all students as present

### 4. View Reports
- **Summary**: See present/absent counts for the selected date
- **History**: View attendance records for the last 10 days
- **Chart**: Visual representation of attendance statistics

## File Structure

```
college-attendance-system/
├── index.html          # Main web page
├── styles.css          # Styling and responsive design
├── script.js           # Frontend JavaScript functionality
├── server.js           # Backend API server
├── package.json        # Node.js dependencies
├── README.md          # This file
└── attendance.db      # SQLite database (created automatically)
```

## API Endpoints

The system provides REST API endpoints for data management:

- `GET /api/students` - Get all students
- `POST /api/students/upload` - Upload students from Excel
- `GET /api/attendance/:date` - Get attendance for specific date
- `POST /api/attendance` - Mark attendance
- `GET /api/attendance/:date/summary` - Get attendance summary
- `GET /api/attendance/history` - Get attendance history

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **UI Framework**: Bootstrap 5
- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Excel Processing**: SheetJS (XLSX)
- **Charts**: Chart.js
- **Icons**: Font Awesome

## Browser Support

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## Troubleshooting

### Excel File Not Uploading
- Make sure file format is .xlsx or .xls
- Check that first row contains headers
- Ensure Roll No and Name columns have data

### Students Not Displaying
- Verify Excel file has proper headers
- Check browser console for errors
- Make sure Roll No and Name columns are not empty

### Data Not Saving
- Check if browser allows localStorage
- Verify server is running
- Check database permissions

## Development

To run in development mode with auto-restart:

```bash
npm run dev
```

## License

This project is licensed under the MIT License.

## Support

For issues or questions, please check the troubleshooting section above or contact the system administrator.

