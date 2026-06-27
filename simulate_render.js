const student = {
  id: '3gJjX3WpU6g222d4fG4x',
  code: 'HSKNRNTZ',
  name: 'TEST TEST'
};

const bookings = [
  {
    id: '4k5werko7-ha-huy-dungs-projects.vercel.app_1782553950000_3gJjX3WpU6g222d4fG4x',
    studentId: '3gJjX3WpU6g222d4fG4x',
    studentCode: 'HSKNRNTZ',
    studentName: 'TEST TEST',
    teacherId: 'Hà Thử Nghiệm tối',
    teacherName: 'Hà Thử Nghiệm tối',
    subjectId: 'v8Yk9Xb12Lp9zT2Qp5zB',
    subjectName: 'GIÁO TRÌNH RIÊNG 120',
    requestedDay: 'sat',
    requestedDate: '2026-06-27',
    requestedWeekStart: '2026-06-22',
    requestedStart: '19:00',
    requestedEnd: '20:40',
    requestedMinutes: 100,
    status: 'confirmed'
  }
];

const weekStart = new Date('2026-06-22T00:00:00'); // Monday June 22

const addDays = (d, days) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const getLocalISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const weekDates = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day, idx) => {
  const d = addDays(weekStart, idx);
  return { day, date: d, iso: getLocalISODate(d) };
});

console.log('weekDates:', weekDates.map(wd => ({ day: wd.day, iso: wd.iso })));

const visibleStarts = [];
for (let min = 420; min < 1320; min += 30) {
  const hrs = Math.floor(min / 60);
  const mns = min % 60;
  visibleStarts.push(`${String(hrs).padStart(2, '0')}:${String(mns).padStart(2, '0')}`);
}

const timeToMinutes = (time) => {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
};

const findBookingForCell = (dateISO, time) => {
  const cellStart = timeToMinutes(time);
  const cellEnd = cellStart + 30;
  return bookings.find((req) => {
    if (req.requestedDate !== dateISO) return false;
    const reqStart = timeToMinutes(req.requestedStart);
    const reqEnd = timeToMinutes(req.requestedEnd);
    return Math.max(cellStart, reqStart) < Math.min(cellEnd, reqEnd);
  });
};

const activeStarts = visibleStarts.filter((start) => {
  return weekDates.some(({ iso }) => findBookingForCell(iso, start));
});

console.log('activeStarts:', activeStarts);
