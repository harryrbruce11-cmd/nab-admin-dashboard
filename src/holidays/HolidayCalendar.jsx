import React, { useMemo, useState } from "react";

export default function HolidayCalendar({ requests = [] }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();

  const approvedRequests = useMemo(() => {
    return requests.filter(
      (request) =>
        String(request?.status || "").toLowerCase() === "approved"
    );
  }, [requests]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    /*
      Monday-first calendar:
      Sunday = 6
      Monday = 0
    */
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const result = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      result.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      result.push(new Date(year, month, day));
    }

    while (result.length % 7 !== 0) {
      result.push(null);
    }

    return result;
  }, [month, year]);

  const selectedEmployees = useMemo(() => {
    if (!selectedDay) return [];

    return getEmployeesOff(selectedDay, approvedRequests);
  }, [selectedDay, approvedRequests]);

  const totalApprovedThisMonth = useMemo(() => {
    return approvedRequests.filter((request) => {
      const start = parseRequestDate(request.startDate);
      const end = parseRequestDate(request.endDate);

      if (!start || !end) return false;

      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

      return start <= monthEnd && end >= monthStart;
    }).length;
  }, [approvedRequests, month, year]);

  const today = startOfDay(new Date());

  function previousMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  }

  function goToToday() {
    const now = new Date();

    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(startOfDay(now));
  }

  function handleDayClick(day) {
    if (!day) return;

    setSelectedDay(startOfDay(day));
  }

  return (
    <div className="holiday-calendar-page">
      <style>{holidayCalendarStyles}</style>

      <div className="holiday-calendar-shell">
        <section className="holiday-calendar-hero">
          <div className="holiday-calendar-hero-top">
            <div className="holiday-calendar-icon">
              <CalendarIcon />
            </div>

            <span className="holiday-calendar-status">
              Team Calendar
            </span>
          </div>

          <h1>Holiday Calendar</h1>

          <p>
            View approved holidays and see who is away each day.
          </p>
        </section>

        <section className="holiday-calendar-summary">
          <div className="holiday-calendar-summary-header">
            <div>
              <span className="holiday-calendar-eyebrow">
                HOLIDAY OVERVIEW
              </span>

              <h2>
                {currentDate.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            <button
              type="button"
              className="holiday-calendar-today-button"
              onClick={goToToday}
            >
              Today
            </button>
          </div>

          <div className="holiday-calendar-stat-row">
            <div className="holiday-calendar-stat holiday-calendar-stat-blue">
              <strong>{totalApprovedThisMonth}</strong>
              <span>Approved requests</span>
            </div>

            <div className="holiday-calendar-stat holiday-calendar-stat-green">
              <strong>{countEmployeesOffToday(approvedRequests)}</strong>
              <span>Off today</span>
            </div>

            <div className="holiday-calendar-stat holiday-calendar-stat-orange">
              <strong>{approvedRequests.length}</strong>
              <span>Total approved</span>
            </div>
          </div>
        </section>

        <section className="holiday-calendar-card">
          <header className="holiday-calendar-header">
            <button
              type="button"
              className="holiday-calendar-arrow"
              onClick={previousMonth}
              aria-label="Previous month"
            >
              <ChevronLeftIcon />
            </button>

            <div className="holiday-calendar-month-title">
              <span>TEAM HOLIDAYS</span>

              <h2>
                {currentDate.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            <button
              type="button"
              className="holiday-calendar-arrow"
              onClick={nextMonth}
              aria-label="Next month"
            >
              <ChevronRightIcon />
            </button>
          </header>

          <div className="holiday-calendar-weekdays">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
              (weekday) => (
                <div key={weekday}>{weekday}</div>
              )
            )}
          </div>

          <div className="holiday-calendar-grid">
            {calendarDays.map((day, index) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="holiday-calendar-empty-day"
                  />
                );
              }

              const employeesOff = getEmployeesOff(
                day,
                approvedRequests
              );

              const isToday = isSameDay(day, today);
              const isSelected =
                selectedDay && isSameDay(day, selectedDay);

              const isWeekend =
                day.getDay() === 0 || day.getDay() === 6;

              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  className={[
                    "holiday-calendar-day",
                    isWeekend
                      ? "holiday-calendar-day-weekend"
                      : "",
                    employeesOff.length > 0
                      ? "holiday-calendar-day-holiday"
                      : "",
                    isToday
                      ? "holiday-calendar-day-today"
                      : "",
                    isSelected
                      ? "holiday-calendar-day-selected"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="holiday-calendar-day-heading">
                    <span className="holiday-calendar-day-number">
                      {day.getDate()}
                    </span>

                    {employeesOff.length > 0 && (
                      <span className="holiday-calendar-count">
                        {employeesOff.length}
                      </span>
                    )}
                  </div>

                  <div className="holiday-calendar-people">
                    {employeesOff.slice(0, 2).map((request, itemIndex) => (
                      <div
                        key={
                          request.id ||
                          `${request.userName}-${itemIndex}`
                        }
                        className="holiday-calendar-person"
                        title={getEmployeeName(request)}
                      >
                        <span className="holiday-calendar-person-dot" />

                        <span>{getEmployeeFirstName(request)}</span>
                      </div>
                    ))}

                    {employeesOff.length > 2 && (
                      <div className="holiday-calendar-more">
                        +{employeesOff.length - 2} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="holiday-calendar-legend">
            <div>
              <span className="holiday-calendar-legend-dot holiday-calendar-legend-approved" />
              Approved holiday
            </div>

            <div>
              <span className="holiday-calendar-legend-dot holiday-calendar-legend-today" />
              Today
            </div>
          </div>
        </section>

        {selectedDay && (
          <section className="holiday-calendar-selected-card">
            <div className="holiday-calendar-selected-heading">
              <div>
                <span className="holiday-calendar-eyebrow">
                  SELECTED DATE
                </span>

                <h2>
                  {selectedDay.toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
              </div>

              <span className="holiday-calendar-selected-count">
                {selectedEmployees.length}{" "}
                {selectedEmployees.length === 1
                  ? "person away"
                  : "people away"}
              </span>
            </div>

            {selectedEmployees.length === 0 ? (
              <div className="holiday-calendar-empty-message">
                <div className="holiday-calendar-empty-icon">
                  <CheckIcon />
                </div>

                <div>
                  <strong>No approved holidays</strong>
                  <p>Everyone is currently available on this date.</p>
                </div>
              </div>
            ) : (
              <div className="holiday-calendar-selected-list">
                {selectedEmployees.map((request, index) => (
                  <div
                    key={
                      request.id ||
                      `${getEmployeeName(request)}-${index}`
                    }
                    className="holiday-calendar-selected-person"
                  >
                    <div className="holiday-calendar-avatar">
                      {getInitials(getEmployeeName(request))}
                    </div>

                    <div className="holiday-calendar-selected-details">
                      <strong>{getEmployeeName(request)}</strong>

                      <span>
                        {formatDate(request.startDate)} to{" "}
                        {formatDate(request.endDate)}
                      </span>
                    </div>

                    <span className="holiday-calendar-approved-badge">
                      Approved
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function getEmployeesOff(date, approvedRequests) {
  const selectedDate = startOfDay(date);

  return approvedRequests.filter((request) => {
    const start = parseRequestDate(request.startDate);
    const end = parseRequestDate(request.endDate);

    if (!start || !end) return false;

    return (
      selectedDate >= startOfDay(start) &&
      selectedDate <= endOfDay(end)
    );
  });
}

function countEmployeesOffToday(approvedRequests) {
  return getEmployeesOff(new Date(), approvedRequests).length;
}

function parseRequestDate(value) {
  if (!value) return null;

  /*
    Firestore Timestamp support
  */
  if (typeof value?.toDate === "function") {
    const firestoreDate = value.toDate();

    return Number.isNaN(firestoreDate.getTime())
      ? null
      : firestoreDate;
  }

  /*
    Firestore serialised timestamp support
  */
  if (typeof value === "object" && value.seconds) {
    const timestampDate = new Date(value.seconds * 1000);

    return Number.isNaN(timestampDate.getTime())
      ? null
      : timestampDate;
  }

  /*
    Prevent YYYY-MM-DD values being shifted by UTC.
  */
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day);
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function startOfDay(date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function endOfDay(date) {
  const result = new Date(date);

  result.setHours(23, 59, 59, 999);

  return result;
}

function isSameDay(firstDate, secondDate) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function getEmployeeName(request) {
  return (
    request?.userName ||
    request?.employeeName ||
    request?.displayName ||
    request?.name ||
    request?.userEmail ||
    "Employee"
  );
}

function getEmployeeFirstName(request) {
  const fullName = getEmployeeName(request).trim();

  return fullName.split(/\s+/)[0] || "Employee";
}

function getInitials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function formatDate(value) {
  const date = parseRequestDate(value);

  if (!date) return "Unknown date";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="34"
      height="34"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

const holidayCalendarStyles = `
  * {
    box-sizing: border-box;
  }

  .holiday-calendar-page {
    width: 100%;
    min-height: 100%;
    padding: 24px;
    background:
      radial-gradient(
        circle at top left,
        rgba(0, 145, 255, 0.11),
        transparent 34%
      ),
      #f2f3f8;
    color: #111216;
    font-family:
      Inter,
      -apple-system,
      BlinkMacSystemFont,
      "SF Pro Display",
      "Segoe UI",
      sans-serif;
  }

  .holiday-calendar-shell {
    width: min(100%, 1180px);
    margin: 0 auto;
  }

  .holiday-calendar-hero {
    padding: 34px 38px 36px;
    overflow: hidden;
    position: relative;
    border-radius: 34px;
    color: white;
    background:
      linear-gradient(
        125deg,
        #078cf8 0%,
        #00b8dc 100%
      );
    box-shadow: 0 22px 45px rgba(0, 140, 245, 0.2);
  }

  .holiday-calendar-hero::after {
    content: "";
    position: absolute;
    right: -80px;
    bottom: -120px;
    width: 310px;
    height: 310px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.09);
  }

  .holiday-calendar-hero-top {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .holiday-calendar-icon {
    width: 84px;
    height: 84px;
    display: grid;
    place-items: center;
    border-radius: 25px;
    color: white;
    background: rgba(255, 255, 255, 0.17);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.25),
      0 10px 25px rgba(0, 69, 158, 0.13);
  }

  .holiday-calendar-status {
    margin-top: 9px;
    padding: 10px 19px;
    border-radius: 999px;
    font-size: 15px;
    font-weight: 850;
    background: rgba(255, 255, 255, 0.17);
    backdrop-filter: blur(12px);
  }

  .holiday-calendar-hero h1 {
    position: relative;
    z-index: 1;
    margin: 28px 0 8px;
    font-size: clamp(31px, 5vw, 47px);
    line-height: 1.04;
    letter-spacing: -1.5px;
    font-weight: 950;
  }

  .holiday-calendar-hero p {
    position: relative;
    z-index: 1;
    margin: 0;
    font-size: clamp(16px, 2.3vw, 21px);
    line-height: 1.5;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.91);
  }

  .holiday-calendar-summary,
  .holiday-calendar-card,
  .holiday-calendar-selected-card {
    margin-top: 24px;
    border-radius: 32px;
    background: #ffffff;
    box-shadow: 0 16px 42px rgba(17, 24, 39, 0.055);
  }

  .holiday-calendar-summary {
    padding: 28px;
  }

  .holiday-calendar-summary-header,
  .holiday-calendar-selected-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .holiday-calendar-eyebrow {
    display: block;
    margin-bottom: 6px;
    color: #94959c;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.8px;
  }

  .holiday-calendar-summary h2,
  .holiday-calendar-selected-heading h2 {
    margin: 0;
    font-size: clamp(23px, 3vw, 31px);
    letter-spacing: -0.7px;
    font-weight: 950;
  }

  .holiday-calendar-today-button {
    min-height: 47px;
    padding: 0 21px;
    border: 0;
    border-radius: 15px;
    color: #057de7;
    background: #e8f4ff;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
    transition:
      transform 160ms ease,
      background 160ms ease;
  }

  .holiday-calendar-today-button:hover {
    transform: translateY(-1px);
    background: #dcefff;
  }

  .holiday-calendar-stat-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 24px;
  }

  .holiday-calendar-stat {
    min-height: 120px;
    padding: 22px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 24px;
    text-align: center;
  }

  .holiday-calendar-stat strong {
    font-size: 38px;
    line-height: 1;
    font-weight: 950;
  }

  .holiday-calendar-stat span {
    margin-top: 10px;
    color: #7c7e86;
    font-size: 14px;
    font-weight: 850;
  }

  .holiday-calendar-stat-blue {
    color: #078af4;
    background: #e6f3ff;
  }

  .holiday-calendar-stat-green {
    color: #20bf58;
    background: #eaf9ee;
  }

  .holiday-calendar-stat-orange {
    color: #ff7d1a;
    background: #fff2e8;
  }

  .holiday-calendar-card {
    padding: 28px;
  }

  .holiday-calendar-header {
    display: grid;
    grid-template-columns: 54px 1fr 54px;
    align-items: center;
    gap: 15px;
    margin-bottom: 26px;
  }

  .holiday-calendar-arrow {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 18px;
    color: #121317;
    background: #f1f2f7;
    cursor: pointer;
    transition:
      transform 160ms ease,
      background 160ms ease;
  }

  .holiday-calendar-arrow:hover {
    transform: scale(1.04);
    background: #e7e9f0;
  }

  .holiday-calendar-arrow:active {
    transform: scale(0.96);
  }

  .holiday-calendar-month-title {
    text-align: center;
  }

  .holiday-calendar-month-title span {
    display: block;
    margin-bottom: 4px;
    color: #98999f;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 1px;
  }

  .holiday-calendar-month-title h2 {
    margin: 0;
    font-size: clamp(24px, 3vw, 34px);
    letter-spacing: -0.9px;
    font-weight: 950;
  }

  .holiday-calendar-weekdays,
  .holiday-calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .holiday-calendar-weekdays {
    gap: 10px;
    margin-bottom: 10px;
  }

  .holiday-calendar-weekdays div {
    padding: 8px 2px;
    color: #96979d;
    text-align: center;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .holiday-calendar-grid {
    gap: 10px;
  }

  .holiday-calendar-empty-day {
    min-height: 126px;
    border-radius: 20px;
    background: #fafafd;
  }

  .holiday-calendar-day {
    appearance: none;
    min-width: 0;
    min-height: 126px;
    padding: 12px;
    border: 2px solid transparent;
    border-radius: 20px;
    color: #111216;
    background: #f5f6fa;
    text-align: left;
    font: inherit;
    cursor: pointer;
    overflow: hidden;
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease,
      background 160ms ease;
  }

  .holiday-calendar-day:hover {
    transform: translateY(-2px);
    border-color: #cfe8ff;
    box-shadow: 0 12px 28px rgba(17, 24, 39, 0.08);
  }

  .holiday-calendar-day-weekend {
    background: #fafafd;
  }

  .holiday-calendar-day-holiday {
    background:
      linear-gradient(
        145deg,
        #e9fbef 0%,
        #f4fff7 100%
      );
  }

  .holiday-calendar-day-today {
    border-color: #0a91f4;
    background: #edf7ff;
  }

  .holiday-calendar-day-selected {
    border-color: #058cf4;
    box-shadow: 0 10px 25px rgba(0, 139, 246, 0.18);
  }

  .holiday-calendar-day-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .holiday-calendar-day-number {
    width: 33px;
    height: 33px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    font-size: 16px;
    font-weight: 950;
  }

  .holiday-calendar-day-today
    .holiday-calendar-day-number {
    color: white;
    background: #078df5;
  }

  .holiday-calendar-count {
    min-width: 25px;
    height: 25px;
    padding: 0 7px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #169349;
    background: #d7f7e1;
    font-size: 11px;
    font-weight: 950;
  }

  .holiday-calendar-people {
    min-width: 0;
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .holiday-calendar-person {
    min-width: 0;
    padding: 5px 7px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 9px;
    color: #14793b;
    background: rgba(38, 187, 92, 0.12);
    font-size: 11px;
    font-weight: 850;
  }

  .holiday-calendar-person span:last-child {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .holiday-calendar-person-dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #23bb5b;
  }

  .holiday-calendar-more {
    padding-left: 4px;
    color: #6f727a;
    font-size: 10px;
    font-weight: 850;
  }

  .holiday-calendar-legend {
    margin-top: 22px;
    padding-top: 20px;
    display: flex;
    align-items: center;
    gap: 24px;
    border-top: 1px solid #e5e5e9;
    color: #7f8188;
    font-size: 13px;
    font-weight: 800;
  }

  .holiday-calendar-legend > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .holiday-calendar-legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .holiday-calendar-legend-approved {
    background: #28c461;
  }

  .holiday-calendar-legend-today {
    background: #078ef5;
  }

  .holiday-calendar-selected-card {
    padding: 28px;
  }

  .holiday-calendar-selected-count {
    padding: 9px 15px;
    border-radius: 999px;
    color: #057edb;
    background: #e8f5ff;
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
  }

  .holiday-calendar-empty-message {
    margin-top: 22px;
    padding: 22px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-radius: 22px;
    background: #f4f6fa;
  }

  .holiday-calendar-empty-icon {
    flex: 0 0 auto;
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 17px;
    color: #18ac50;
    background: #dcf8e5;
  }

  .holiday-calendar-empty-message strong {
    font-size: 17px;
    font-weight: 950;
  }

  .holiday-calendar-empty-message p {
    margin: 4px 0 0;
    color: #7d7f86;
    font-size: 14px;
    font-weight: 650;
  }

  .holiday-calendar-selected-list {
    margin-top: 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .holiday-calendar-selected-person {
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    border-radius: 20px;
    background: #f4f5f9;
  }

  .holiday-calendar-avatar {
    flex: 0 0 auto;
    width: 49px;
    height: 49px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    color: white;
    background:
      linear-gradient(
        135deg,
        #0b91f6,
        #00b7da
      );
    font-size: 15px;
    font-weight: 950;
  }

  .holiday-calendar-selected-details {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .holiday-calendar-selected-details strong {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 16px;
    font-weight: 950;
  }

  .holiday-calendar-selected-details span {
    color: #7c7e85;
    font-size: 13px;
    font-weight: 700;
  }

  .holiday-calendar-approved-badge {
    padding: 8px 12px;
    border-radius: 999px;
    color: #159346;
    background: #ddf8e6;
    font-size: 12px;
    font-weight: 900;
  }

  @media (max-width: 820px) {
    .holiday-calendar-page {
      padding: 16px;
    }

    .holiday-calendar-hero {
      padding: 28px 25px 30px;
      border-radius: 28px;
    }

    .holiday-calendar-icon {
      width: 70px;
      height: 70px;
      border-radius: 21px;
    }

    .holiday-calendar-summary,
    .holiday-calendar-card,
    .holiday-calendar-selected-card {
      border-radius: 27px;
    }

    .holiday-calendar-summary,
    .holiday-calendar-card,
    .holiday-calendar-selected-card {
      padding: 21px;
    }

    .holiday-calendar-stat-row {
      gap: 10px;
    }

    .holiday-calendar-stat {
      min-height: 105px;
      padding: 17px 8px;
      border-radius: 20px;
    }

    .holiday-calendar-stat strong {
      font-size: 31px;
    }

    .holiday-calendar-stat span {
      font-size: 12px;
    }

    .holiday-calendar-grid,
    .holiday-calendar-weekdays {
      gap: 6px;
    }

    .holiday-calendar-day,
    .holiday-calendar-empty-day {
      min-height: 101px;
      border-radius: 16px;
    }

    .holiday-calendar-day {
      padding: 8px;
    }

    .holiday-calendar-person {
      padding: 4px 5px;
      font-size: 9px;
    }

    .holiday-calendar-day-number {
      width: 29px;
      height: 29px;
      font-size: 14px;
    }
  }

  @media (max-width: 580px) {
    .holiday-calendar-page {
      padding: 10px;
    }

    .holiday-calendar-hero {
      padding: 24px 20px 27px;
      border-radius: 25px;
    }

    .holiday-calendar-hero h1 {
      margin-top: 22px;
    }

    .holiday-calendar-status {
      padding: 8px 13px;
      font-size: 12px;
    }

    .holiday-calendar-icon {
      width: 63px;
      height: 63px;
      border-radius: 19px;
    }

    .holiday-calendar-summary-header,
    .holiday-calendar-selected-heading {
      align-items: flex-start;
    }

    .holiday-calendar-stat-row {
      grid-template-columns: repeat(3, 1fr);
    }

    .holiday-calendar-stat {
      min-height: 94px;
    }

    .holiday-calendar-stat strong {
      font-size: 27px;
    }

    .holiday-calendar-stat span {
      font-size: 10px;
    }

    .holiday-calendar-card {
      padding: 15px 10px 18px;
    }

    .holiday-calendar-header {
      grid-template-columns: 46px 1fr 46px;
      gap: 8px;
    }

    .holiday-calendar-arrow {
      width: 46px;
      height: 46px;
      border-radius: 15px;
    }

    .holiday-calendar-weekdays {
      gap: 3px;
    }

    .holiday-calendar-weekdays div {
      font-size: 10px;
    }

    .holiday-calendar-grid {
      gap: 3px;
    }

    .holiday-calendar-day,
    .holiday-calendar-empty-day {
      min-height: 74px;
      border-radius: 11px;
    }

    .holiday-calendar-day {
      padding: 5px;
      border-width: 1.5px;
    }

    .holiday-calendar-day-number {
      width: 25px;
      height: 25px;
      border-radius: 8px;
      font-size: 12px;
    }

    .holiday-calendar-count {
      min-width: 19px;
      height: 19px;
      padding: 0 5px;
      font-size: 9px;
    }

    .holiday-calendar-people {
      margin-top: 4px;
      gap: 3px;
    }

    .holiday-calendar-person {
      padding: 3px 4px;
      border-radius: 6px;
      font-size: 8px;
    }

    .holiday-calendar-person-dot {
      display: none;
    }

    .holiday-calendar-more {
      display: none;
    }

    .holiday-calendar-legend {
      padding: 16px 5px 0;
      gap: 14px;
      font-size: 11px;
    }

    .holiday-calendar-selected-heading {
      flex-direction: column;
      gap: 12px;
    }

    .holiday-calendar-selected-person {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .holiday-calendar-approved-badge {
      margin-left: 63px;
    }
  }
`;