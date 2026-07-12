// src/holidays/HolidayDashboard.jsx

// src/holidays/HolidayDashboard.jsx

// src/holidays/HolidayDashboard.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import {
  mainAuth,
  mainDb,
  vehicleCheckDb,
} from "../firebase";

import HolidayCalendar from "./HolidayCalendar";
import HolidayRequestDialog from "./HolidayRequestDialog";

const DEFAULT_ALLOWANCE = 28;

export default function HolidayDashboard({
  onBack,
}) {
  const [firebaseUser, setFirebaseUser] =
    useState(null);

  const [userProfile, setUserProfile] =
    useState(null);

  const [rawRequests, setRawRequests] =
    useState([]);

  const [loadingAuth, setLoadingAuth] =
    useState(true);

  const [loadingProfile, setLoadingProfile] =
    useState(false);

  const [loadingRequests, setLoadingRequests] =
    useState(true);

  const [showRequestDialog, setShowRequestDialog] =
    useState(false);

  const [searchText, setSearchText] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [historyScope, setHistoryScope] =
    useState("Mine");

  const [errorMessage, setErrorMessage] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | Harry Bruce Firebase Authentication
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      mainAuth,
      (user) => {
        setFirebaseUser(user);
        setLoadingAuth(false);
      },
      (error) => {
        console.error(
          "Could not load signed-in user:",
          error
        );

        setFirebaseUser(null);
        setLoadingAuth(false);

        setErrorMessage(
          "The signed-in Firebase user could not be loaded."
        );
      }
    );

    return unsubscribe;
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Load or create the user's Harry Bruce Firestore profile
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUserProfile(null);
      setLoadingProfile(false);
      return undefined;
    }

    setLoadingProfile(true);

    const userReference = doc(
      mainDb,
      "users",
      firebaseUser.uid
    );

    let creatingProfile = false;

    const unsubscribe = onSnapshot(
      userReference,
      async (snapshot) => {
        if (snapshot.exists()) {
          setUserProfile({
            id: snapshot.id,
            ...snapshot.data(),
          });

          setLoadingProfile(false);
          return;
        }

        if (creatingProfile) {
          return;
        }

        creatingProfile = true;

        const displayName =
          firebaseUser.displayName ||
          nameFromEmail(firebaseUser.email) ||
          "User";

        const newProfile = {
          uid: firebaseUser.uid,
          displayName,
          name: displayName,
          email: firebaseUser.email || "",
          annualAllowance: DEFAULT_ALLOWANCE,
          holidayAllowance: DEFAULT_ALLOWANCE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        try {
          await setDoc(
            userReference,
            newProfile,
            { merge: true }
          );

          setUserProfile({
            id: firebaseUser.uid,
            ...newProfile,
          });
        } catch (error) {
          console.error(
            "Could not create user profile:",
            error
          );

          setUserProfile({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            displayName,
            name: displayName,
            email: firebaseUser.email || "",
            annualAllowance: DEFAULT_ALLOWANCE,
            holidayAllowance: DEFAULT_ALLOWANCE,
          });
        } finally {
          creatingProfile = false;
          setLoadingProfile(false);
        }
      },
      (error) => {
        console.error(
          "Could not load user profile:",
          error
        );

        const displayName =
          firebaseUser.displayName ||
          nameFromEmail(firebaseUser.email) ||
          "User";

        setUserProfile({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          displayName,
          name: displayName,
          email: firebaseUser.email || "",
          annualAllowance: DEFAULT_ALLOWANCE,
          holidayAllowance: DEFAULT_ALLOWANCE,
        });

        setLoadingProfile(false);
      }
    );

    return unsubscribe;
  }, [firebaseUser?.uid]);

  /*
  |--------------------------------------------------------------------------
  | Vehicle Check holiday requests
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(
        vehicleCheckDb,
        "holidayRequests"
      ),
      (snapshot) => {
        setRawRequests(
          snapshot.docs.map((requestDocument) => ({
            id: requestDocument.id,
            ...requestDocument.data(),
          }))
        );

        setLoadingRequests(false);
      },
      (error) => {
        console.error(
          "Could not load holiday requests:",
          error
        );

        setLoadingRequests(false);

        setErrorMessage(
          "Holiday requests could not be loaded from Vehicle Check."
        );
      }
    );

    return unsubscribe;
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Normalised request data
  |--------------------------------------------------------------------------
  */

  const requests = useMemo(() => {
    return rawRequests
      .map(normaliseHolidayRequest)
      .sort((first, second) => {
        const firstCreated =
          parseDate(
            first.dateOfRequest ||
              first.createdAt
          )?.getTime() || 0;

        const secondCreated =
          parseDate(
            second.dateOfRequest ||
              second.createdAt
          )?.getTime() || 0;

        return secondCreated - firstCreated;
      });
  }, [rawRequests]);

  const displayName = useMemo(() => {
    return (
      userProfile?.displayName ||
      userProfile?.employeeName ||
      userProfile?.name ||
      userProfile?.userName ||
      firebaseUser?.displayName ||
      nameFromEmail(firebaseUser?.email) ||
      firebaseUser?.email ||
      "Signed-in user"
    );
  }, [
    firebaseUser,
    userProfile,
  ]);

  const displayEmail = useMemo(() => {
    return (
      userProfile?.email ||
      userProfile?.userEmail ||
      firebaseUser?.email ||
      ""
    );
  }, [
    firebaseUser,
    userProfile,
  ]);

  const annualAllowance = useMemo(() => {
    return firstNumber(
      [
        userProfile?.annualAllowance,
        userProfile?.holidayAllowance,
        userProfile?.allowance,
        userProfile?.totalHolidayDays,
      ],
      DEFAULT_ALLOWANCE
    );
  }, [userProfile]);

  /*
  |--------------------------------------------------------------------------
  | Current user's requests
  |--------------------------------------------------------------------------
  */

  const currentUserRequests = useMemo(() => {
    if (!firebaseUser?.uid) {
      return [];
    }

    return requests.filter((request) => {
      return (
        String(request.uid || "") ===
        String(firebaseUser.uid)
      );
    });
  }, [
    firebaseUser?.uid,
    requests,
  ]);

  const approvedUserRequests = useMemo(() => {
    return currentUserRequests.filter(
      (request) =>
        normaliseStatus(request.status) ===
        "approved"
    );
  }, [currentUserRequests]);

  const pendingUserRequests = useMemo(() => {
    return currentUserRequests.filter(
      (request) =>
        normaliseStatus(request.status) ===
        "pending"
    );
  }, [currentUserRequests]);

  const rejectedUserRequests = useMemo(() => {
    return currentUserRequests.filter(
      (request) =>
        normaliseStatus(request.status) ===
        "rejected"
    );
  }, [currentUserRequests]);

  const usedDays = useMemo(() => {
    return approvedUserRequests.reduce(
      (total, request) =>
        total + request.workingDays,
      0
    );
  }, [approvedUserRequests]);

  const pendingDays = useMemo(() => {
    return pendingUserRequests.reduce(
      (total, request) =>
        total + request.workingDays,
      0
    );
  }, [pendingUserRequests]);

  const remainingDays = Math.max(
    annualAllowance - usedDays,
    0
  );

  const availableAfterPending = Math.max(
    remainingDays - pendingDays,
    0
  );

  /*
  |--------------------------------------------------------------------------
  | Shared calendar and team availability
  |--------------------------------------------------------------------------
  */

  const approvedTeamRequests = useMemo(() => {
    return requests.filter(
      (request) =>
        normaliseStatus(request.status) ===
        "approved"
    );
  }, [requests]);

  const upcomingTeamRequests = useMemo(() => {
    const today = startOfDay(new Date());

    return approvedTeamRequests
      .filter((request) => {
        const lastDay =
          parseDate(request.lastDayOff);

        return (
          lastDay &&
          endOfDay(lastDay) >= today
        );
      })
      .sort((first, second) => {
        return (
          (parseDate(
            first.firstDayOff
          )?.getTime() || 0) -
          (parseDate(
            second.firstDayOff
          )?.getTime() || 0)
        );
      });
  }, [approvedTeamRequests]);

  const awayToday = useMemo(() => {
    return approvedTeamRequests.filter(
      (request) =>
        requestContainsDate(
          request,
          new Date()
        )
    );
  }, [approvedTeamRequests]);

  /*
  |--------------------------------------------------------------------------
  | Modern history filters
  |--------------------------------------------------------------------------
  */

  const historySource =
    historyScope === "All"
      ? requests
      : currentUserRequests;

  const filteredHistory = useMemo(() => {
    const search =
      searchText.trim().toLowerCase();

    return historySource.filter((request) => {
      const status =
        request.status || "Pending";

      const matchesStatus =
        statusFilter === "All" ||
        normaliseStatus(status) ===
          normaliseStatus(statusFilter);

      const matchesSearch =
        !search ||
        [
          request.employeeName,
          request.userEmail,
          request.reason,
          request.status,
          request.adminComment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      return matchesStatus && matchesSearch;
    });
  }, [
    historySource,
    searchText,
    statusFilter,
  ]);

  const loading =
    loadingAuth ||
    loadingProfile ||
    loadingRequests;

  return (
    <main className="holiday-page">
      <style>{styles}</style>

      <div className="holiday-shell">
        <header className="holiday-topbar">
          <button
            type="button"
            className="holiday-back"
            onClick={onBack}
          >
            <BackIcon />
            Dashboard
          </button>

          <div className="holiday-topbar-title">
            <span>HOLIDAY MANAGEMENT</span>
            <h1>Holiday Dashboard</h1>
          </div>

          <button
            type="button"
            className="holiday-new"
            disabled={!firebaseUser}
            onClick={() =>
              setShowRequestDialog(true)
            }
          >
            <PlusIcon />
            New Holiday Request
          </button>
        </header>

        {errorMessage && (
          <div className="holiday-error">
            <WarningIcon />

            <span>{errorMessage}</span>

            <button
              type="button"
              onClick={() =>
                setErrorMessage("")
              }
            >
              ×
            </button>
          </div>
        )}

        {loading ? (
          <section className="holiday-loading">
            <span className="holiday-spinner" />
            Loading holiday information...
          </section>
        ) : (
          <>
            <section className="holiday-hero">
              <div className="holiday-hero-top">
                <div className="holiday-profile-avatar">
                  {initials(displayName)}
                </div>

                <span className="holiday-signed-in">
                  Signed in
                </span>
              </div>

              <span className="holiday-eyebrow-light">
                WELCOME BACK
              </span>

              <h2>{displayName}</h2>

              <p>
                {displayEmail ||
                  "Your holiday information is shown below."}
              </p>
            </section>

            <section className="holiday-card">
              <div className="holiday-card-heading">
                <div>
                  <span>YOUR ALLOWANCE</span>
                  <h2>Holiday Balance</h2>
                </div>

                <span className="holiday-year">
                  {new Date().getFullYear()}
                </span>
              </div>

              <div className="holiday-stats">
                <StatCard
                  value={annualAllowance}
                  label="Allowance"
                  type="blue"
                />

                <StatCard
                  value={usedDays}
                  label="Used"
                  type="orange"
                />

                <StatCard
                  value={remainingDays}
                  label="Left"
                  type="green"
                />

                <StatCard
                  value={pendingDays}
                  label="Pending"
                  type="purple"
                />
              </div>

              <div className="holiday-balance-footer">
                <div>
                  <span>
                    Available after pending
                  </span>

                  <strong>
                    {availableAfterPending} days
                  </strong>
                </div>

                <div>
                  <span>Rejected requests</span>
                  <strong>
                    {rejectedUserRequests.length}
                  </strong>
                </div>
              </div>
            </section>

            <section className="holiday-team-banner">
              <div>
                <span>TEAM AVAILABILITY</span>
                <h2>Team Holiday Calendar</h2>
                <p>
                  View approved holidays booked by all
                  users.
                </p>
              </div>

              <div className="holiday-away-count">
                <strong>{awayToday.length}</strong>
                <span>Away today</span>
              </div>
            </section>

            <HolidayCalendar
              requests={approvedTeamRequests}
            />

            <section className="holiday-card">
              <div className="holiday-card-heading">
                <div>
                  <span>
                    UPCOMING APPROVED HOLIDAYS
                  </span>
                  <h2>Dates Already Taken</h2>
                </div>

                <span className="holiday-count">
                  {upcomingTeamRequests.length}
                </span>
              </div>

              {upcomingTeamRequests.length === 0 ? (
                <EmptyState
                  title="No upcoming holidays"
                  message="There are currently no approved upcoming holidays."
                />
              ) : (
                <div className="holiday-booking-list">
                  {upcomingTeamRequests.map(
                    (request) => (
                      <TeamHolidayRow
                        key={request.id}
                        request={request}
                      />
                    )
                  )}
                </div>
              )}
            </section>

            <section className="holiday-card holiday-history-card">
              <div className="holiday-history-heading">
                <div>
                  <span>HISTORY</span>
                  <h2>Holiday Requests</h2>
                  <p>
                    Full request details with correct
                    Firestore dates.
                  </p>
                </div>

                <span className="holiday-count">
                  {filteredHistory.length}
                </span>
              </div>

              <div className="holiday-history-controls">
                <div className="holiday-search">
                  <SearchIcon />

                  <input
                    type="search"
                    value={searchText}
                    placeholder="Search employee, reason or status..."
                    onChange={(event) =>
                      setSearchText(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="holiday-scope-buttons">
                  {["Mine", "All"].map(
                    (scope) => (
                      <button
                        key={scope}
                        type="button"
                        className={
                          historyScope === scope
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          setHistoryScope(scope)
                        }
                      >
                        {scope === "Mine"
                          ? "My Requests"
                          : "All Requests"}
                      </button>
                    )
                  )}
                </div>

                <div className="holiday-status-buttons">
                  {[
                    "All",
                    "Pending",
                    "Approved",
                    "Rejected",
                  ].map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={
                        statusFilter === status
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setStatusFilter(status)
                      }
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <EmptyState
                  title="No holiday requests found"
                  message="No requests match the selected filters."
                />
              ) : (
                <div className="holiday-history-list">
                  {filteredHistory.map(
                    (request) => (
                      <HistoryCard
                        key={request.id}
                        request={request}
                      />
                    )
                  )}
                </div>
              )}
            </section>
          </>
        )}

        <HolidayRequestDialog
          open={showRequestDialog}
          onClose={() =>
            setShowRequestDialog(false)
          }
          onSubmitted={() =>
            setShowRequestDialog(false)
          }
        />
      </div>
    </main>
  );
}

function StatCard({
  value,
  label,
  type,
}) {
  return (
    <div
      className={`holiday-stat holiday-stat-${type}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TeamHolidayRow({
  request,
}) {
  const isAwayNow =
    requestContainsDate(
      request,
      new Date()
    );

  return (
    <article className="holiday-team-row">
      <div className="holiday-team-person">
        <div className="holiday-team-avatar">
          {initials(request.employeeName)}
        </div>

        <div>
          <strong>
            {request.employeeName}
          </strong>

          <span>
            {request.userEmail ||
              "Employee"}
          </span>
        </div>
      </div>

      <DateBox
        label="First day off"
        value={formatDate(
          request.firstDayOff
        )}
      />

      <DateArrowIcon />

      <DateBox
        label="Last day off"
        value={formatDate(
          request.lastDayOff
        )}
      />

      <div className="holiday-team-days">
        <strong>
          {request.workingDays}
        </strong>
        <span>working days</span>
      </div>

      <div className="holiday-team-badges">
        {isAwayNow && (
          <span className="holiday-away-badge">
            Away now
          </span>
        )}

        <span className="holiday-approved-badge">
          Approved
        </span>
      </div>
    </article>
  );
}

function HistoryCard({
  request,
}) {
  return (
    <article className="holiday-history-row">
      <div className="holiday-history-user">
        <div className="holiday-history-avatar">
          {initials(request.employeeName)}
        </div>

        <div>
          <strong>
            {request.employeeName}
          </strong>

          <span>
            {request.userEmail ||
              "No email address"}
          </span>
        </div>
      </div>

      <div className="holiday-history-details">
        <HistoryDetail
          label="Requested"
          value={formatDateTime(
            request.dateOfRequest ||
              request.createdAt
          )}
        />

        <HistoryDetail
          label="First day"
          value={formatDate(
            request.firstDayOff
          )}
        />

        <HistoryDetail
          label="Last day"
          value={formatDate(
            request.lastDayOff
          )}
        />

        <HistoryDetail
          label="Return"
          value={formatDate(
            request.returnToWorkDate
          )}
        />

        <HistoryDetail
          label="Days"
          value={`${request.workingDays}`}
        />
      </div>

      <div className="holiday-history-bottom">
        <div className="holiday-history-reason">
          <span>REASON</span>
          <p>
            {request.reason ||
              "No reason provided."}
          </p>
        </div>

        <StatusBadge
          status={request.status}
        />
      </div>

      {request.adminComment && (
        <div className="holiday-admin-response">
          <span>HR RESPONSE</span>
          <p>{request.adminComment}</p>
        </div>
      )}
    </article>
  );
}

function HistoryDetail({
  label,
  value,
}) {
  return (
    <div className="holiday-history-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DateBox({
  label,
  value,
}) {
  return (
    <div className="holiday-date-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({
  status,
}) {
  const normalised =
    normaliseStatus(status);

  const className =
    normalised === "approved"
      ? "approved"
      : normalised === "rejected"
      ? "rejected"
      : "pending";

  return (
    <span
      className={`holiday-status holiday-status-${className}`}
    >
      {status || "Pending"}
    </span>
  );
}

function EmptyState({
  title,
  message,
}) {
  return (
    <div className="holiday-empty">
      <div>
        <CalendarCheckIcon />
      </div>

      <section>
        <strong>{title}</strong>
        <p>{message}</p>
      </section>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Request normalisation
|--------------------------------------------------------------------------
*/

function normaliseHolidayRequest(
  request
) {
  const firstDayOff =
    request.firstDayOff ??
    request.startDate ??
    request.firstDate ??
    null;

  const lastDayOff =
    request.lastDayOff ??
    request.endDate ??
    request.lastDate ??
    null;

  const returnToWorkDate =
    request.returnToWorkDate ??
    request.backToWorkDate ??
    null;

  const employeeName =
    request.employeeName ??
    request.userName ??
    request.displayName ??
    request.name ??
    request.userEmail ??
    "Employee";

  const dateOfRequest =
    request.dateOfRequest ??
    request.requestDate ??
    request.createdAt ??
    null;

  const storedWorkingDays = Number(
    request.totalWorkingDaysAbsent ??
      request.workingDays
  );

  const workingDays =
    Number.isFinite(storedWorkingDays)
      ? Math.max(storedWorkingDays, 0)
      : calculateWorkingDays(
          firstDayOff,
          lastDayOff
        );

  return {
    ...request,

    employeeName,
    userName: employeeName,

    firstDayOff,
    startDate: firstDayOff,

    lastDayOff,
    endDate: lastDayOff,

    returnToWorkDate,

    dateOfRequest,
    requestDate: dateOfRequest,

    workingDays,

    totalWorkingDaysAbsent:
      String(workingDays),

    status:
      request.status || "Pending",

    reason:
      request.reason || "",

    adminComment:
      request.adminComment ||
      request.comment ||
      "",
  };
}

function calculateWorkingDays(
  startValue,
  endValue
) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (!start || !end || end < start) {
    return 0;
  }

  const current = startOfDay(start);
  const finalDate = startOfDay(end);

  let total = 0;

  while (current <= finalDate) {
    const weekday = current.getDay();

    if (weekday !== 0 && weekday !== 6) {
      total += 1;
    }

    current.setDate(
      current.getDate() + 1
    );
  }

  return total;
}

function requestContainsDate(
  request,
  value
) {
  const selected = parseDate(value);
  const start = parseDate(
    request.firstDayOff
  );
  const end = parseDate(
    request.lastDayOff
  );

  if (!selected || !start || !end) {
    return false;
  }

  return (
    startOfDay(selected) >=
      startOfDay(start) &&
    startOfDay(selected) <=
      endOfDay(end)
  );
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value);
  }

  if (
    typeof value?.toDate === "function"
  ) {
    const date = value.toDate();

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (
    typeof value === "object" &&
    value.seconds !== undefined
  ) {
    const date = new Date(
      Number(value.seconds) * 1000
    );

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (
    typeof value === "object" &&
    value._seconds !== undefined
  ) {
    const date = new Date(
      Number(value._seconds) * 1000
    );

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const [year, month, day] =
      value.split("-").map(Number);

    return new Date(
      year,
      month - 1,
      day
    );
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function formatDate(value) {
  const date = parseDate(value);

  if (!date) {
    return "Not set";
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(value) {
  const date = parseDate(value);

  if (!date) {
    return "Not set";
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
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

function normaliseStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function firstNumber(
  values,
  fallback
) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return Math.max(number, 0);
    }
  }

  return fallback;
}

function nameFromEmail(email) {
  if (!email) {
    return "";
  }

  return String(email)
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function initials(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) =>
        part.charAt(0).toUpperCase()
      )
      .join("") || "U"
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="3"
      />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="m8 15 2 2 5-5" />
    </svg>
  );
}

function DateArrowIcon() {
  return (
    <svg
      className="holiday-date-arrow"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  .holiday-page {
    min-height: 100vh;
    padding: 24px;
    color: #111318;
    background:
      radial-gradient(
        circle at top left,
        rgba(7, 141, 248, 0.12),
        transparent 36%
      ),
      #f2f3f8;
    font-family:
      Inter,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .holiday-shell {
    width: min(100%, 1280px);
    margin: 0 auto;
    display: grid;
    gap: 22px;
  }

  .holiday-topbar {
    padding: 24px 28px;
    display: grid;
    grid-template-columns: 190px 1fr 245px;
    align-items: center;
    gap: 20px;
    border-radius: 31px;
    background: rgba(255,255,255,.96);
    box-shadow: 0 17px 44px rgba(17,24,39,.06);
  }

  .holiday-back,
  .holiday-new {
    min-height: 55px;
    padding: 0 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border: 0;
    border-radius: 18px;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }

  .holiday-back {
    justify-self: start;
    color: #52545c;
    background: #f0f1f5;
  }

  .holiday-new {
    justify-self: end;
    color: white;
    background: linear-gradient(125deg,#078df8,#00afd8);
    box-shadow: 0 14px 28px rgba(0,143,240,.22);
  }

  .holiday-new:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  .holiday-back svg,
  .holiday-new svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
  }

  .holiday-topbar-title {
    text-align: center;
  }

  .holiday-topbar-title span,
  .holiday-card-heading > div > span,
  .holiday-history-heading > div > span {
    color: #078bf4;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: .9px;
  }

  .holiday-topbar-title h1 {
    margin: 5px 0 0;
    font-size: clamp(27px,4vw,38px);
    font-weight: 950;
  }

  .holiday-error {
    padding: 17px 19px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 19px;
    color: #b62031;
    background: #ffe7ea;
    font-weight: 800;
  }

  .holiday-error svg {
    width: 23px;
    height: 23px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
  }

  .holiday-error button {
    margin-left: auto;
    border: 0;
    color: inherit;
    background: transparent;
    font-size: 25px;
    cursor: pointer;
  }

  .holiday-loading {
    min-height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
    border-radius: 32px;
    color: #777981;
    background: white;
    font-weight: 850;
  }

  .holiday-spinner {
    width: 29px;
    height: 29px;
    border: 3px solid rgba(7,141,248,.18);
    border-top-color: #078df8;
    border-radius: 50%;
    animation: holiday-spin .7s linear infinite;
  }

  @keyframes holiday-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .holiday-hero {
    padding: 38px;
    overflow: hidden;
    position: relative;
    border-radius: 35px;
    color: white;
    background: linear-gradient(125deg,#078df9,#00bad8);
    box-shadow: 0 23px 44px rgba(0,139,245,.2);
  }

  .holiday-hero::after {
    content: "";
    position: absolute;
    right: -90px;
    bottom: -145px;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: rgba(255,255,255,.09);
  }

  .holiday-hero-top {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
  }

  .holiday-profile-avatar {
    width: 84px;
    height: 84px;
    display: grid;
    place-items: center;
    border-radius: 25px;
    background: rgba(255,255,255,.18);
    font-size: 25px;
    font-weight: 950;
  }

  .holiday-signed-in {
    margin-top: 9px;
    padding: 10px 18px;
    border-radius: 999px;
    background: rgba(255,255,255,.17);
    font-weight: 900;
  }

  .holiday-eyebrow-light {
    position: relative;
    z-index: 1;
    display: block;
    margin-top: 27px;
    color: rgba(255,255,255,.75);
    font-size: 11px;
    font-weight: 950;
    letter-spacing: .9px;
  }

  .holiday-hero h2 {
    position: relative;
    z-index: 1;
    margin: 5px 0 7px;
    font-size: clamp(34px,5vw,49px);
    font-weight: 950;
  }

  .holiday-hero p {
    position: relative;
    z-index: 1;
    margin: 0;
    color: rgba(255,255,255,.9);
    font-size: 18px;
  }

  .holiday-card {
    padding: 30px;
    border-radius: 34px;
    background: white;
    box-shadow: 0 15px 40px rgba(17,24,39,.05);
  }

  .holiday-card-heading,
  .holiday-history-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .holiday-card-heading h2,
  .holiday-history-heading h2 {
    margin: 5px 0 0;
    font-size: 29px;
    font-weight: 950;
  }

  .holiday-history-heading p {
    margin: 5px 0 0;
    color: #85878e;
    font-size: 13px;
  }

  .holiday-year,
  .holiday-count {
    min-width: 52px;
    height: 49px;
    padding: 0 13px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    color: #078bf4;
    background: #e5f3ff;
    font-weight: 950;
  }

  .holiday-stats {
    margin-top: 25px;
    display: grid;
    grid-template-columns: repeat(4,1fr);
    gap: 15px;
  }

  .holiday-stat {
    min-height: 130px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 27px;
  }

  .holiday-stat strong {
    font-size: 44px;
    line-height: 1;
    font-weight: 950;
  }

  .holiday-stat span {
    margin-top: 11px;
    color: #7d7f86;
    font-weight: 850;
  }

  .holiday-stat-blue {
    color: #078af4;
    background: #e5f3ff;
  }

  .holiday-stat-orange {
    color: #ff7d1b;
    background: #fff2e8;
  }

  .holiday-stat-green {
    color: #25c45d;
    background: #e9f9ee;
  }

  .holiday-stat-purple {
    color: #7548dc;
    background: #f0eaff;
  }

  .holiday-balance-footer {
    margin-top: 22px;
    padding-top: 21px;
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #dedfe3;
  }

  .holiday-balance-footer > div {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .holiday-balance-footer > div:last-child {
    text-align: right;
  }

  .holiday-balance-footer span {
    color: #92949b;
    font-size: 13px;
    font-weight: 800;
  }

  .holiday-balance-footer strong {
    font-size: 20px;
    font-weight: 950;
  }

  .holiday-team-banner {
    padding: 29px 31px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    border-radius: 31px;
    color: white;
    background: linear-gradient(125deg,#15171e,#30343e);
  }

  .holiday-team-banner > div:first-child > span {
    color: #71c8ff;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: .9px;
  }

  .holiday-team-banner h2 {
    margin: 5px 0 4px;
    font-size: 29px;
    font-weight: 950;
  }

  .holiday-team-banner p {
    margin: 0;
    color: rgba(255,255,255,.7);
  }

  .holiday-away-count {
    min-width: 145px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: 22px;
    background: rgba(255,255,255,.09);
  }

  .holiday-away-count strong {
    font-size: 34px;
    line-height: 1;
    font-weight: 950;
  }

  .holiday-away-count span {
    margin-top: 7px;
    color: rgba(255,255,255,.67);
    font-size: 11px;
  }

  .holiday-booking-list,
  .holiday-history-list {
    margin-top: 23px;
    display: flex;
    flex-direction: column;
    gap: 13px;
  }

  .holiday-team-row {
    padding: 17px;
    display: grid;
    grid-template-columns:
      minmax(185px,1fr)
      minmax(140px,.7fr)
      auto
      minmax(140px,.7fr)
      auto
      auto;
    align-items: center;
    gap: 14px;
    border: 1px solid #e7e8ec;
    border-radius: 23px;
    background: #fafafd;
  }

  .holiday-team-person,
  .holiday-history-user {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .holiday-team-avatar,
  .holiday-history-avatar {
    flex: 0 0 auto;
    width: 53px;
    height: 53px;
    display: grid;
    place-items: center;
    border-radius: 17px;
    color: white;
    background: linear-gradient(135deg,#078df8,#00afd8);
    font-weight: 950;
  }

  .holiday-team-person strong,
  .holiday-team-person span,
  .holiday-history-user strong,
  .holiday-history-user span {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .holiday-team-person strong,
  .holiday-history-user strong {
    font-size: 16px;
    font-weight: 950;
  }

  .holiday-team-person span,
  .holiday-history-user span {
    margin-top: 4px;
    color: #898b92;
    font-size: 11px;
  }

  .holiday-date-box {
    padding: 12px 14px;
    border-radius: 16px;
    background: #f0f1f5;
  }

  .holiday-date-box span {
    color: #96989f;
    font-size: 9px;
    font-weight: 950;
    text-transform: uppercase;
  }

  .holiday-date-box strong {
    display: block;
    margin-top: 4px;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 900;
  }

  .holiday-date-arrow {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: #999ba2;
    stroke-width: 2;
  }

  .holiday-team-days {
    min-width: 72px;
    text-align: center;
  }

  .holiday-team-days strong {
    display: block;
    font-size: 25px;
    line-height: 1;
    font-weight: 950;
  }

  .holiday-team-days span {
    display: block;
    margin-top: 5px;
    color: #8c8e95;
    font-size: 9px;
  }

  .holiday-team-badges {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
  }

  .holiday-approved-badge,
  .holiday-away-badge,
  .holiday-status {
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 950;
    white-space: nowrap;
  }

  .holiday-approved-badge,
  .holiday-status-approved {
    color: #168743;
    background: #dcf7e5;
  }

  .holiday-away-badge {
    color: #087dcb;
    background: #e2f3ff;
  }

  .holiday-status-pending {
    color: #a55e00;
    background: #fff0d8;
  }

  .holiday-status-rejected {
    color: #bd2334;
    background: #ffe4e8;
  }

  .holiday-empty {
    min-height: 145px;
    margin-top: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    border-radius: 22px;
    background: #f5f6f9;
  }

  .holiday-empty > div {
    width: 62px;
    height: 62px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    color: #1aa451;
    background: #dff7e7;
  }

  .holiday-empty svg {
    width: 32px;
    height: 32px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .holiday-empty strong {
    font-size: 18px;
    font-weight: 950;
  }

  .holiday-empty p {
    margin: 5px 0 0;
    color: #85878e;
    font-size: 13px;
  }

  .holiday-history-controls {
    margin-top: 23px;
    display: grid;
    gap: 14px;
  }

  .holiday-search {
    min-height: 64px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 20px;
    background: #f0f1f5;
  }

  .holiday-search svg {
    width: 23px;
    height: 23px;
    fill: none;
    stroke: #7e8088;
    stroke-width: 2;
  }

  .holiday-search input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 16px;
    font-weight: 700;
  }

  .holiday-scope-buttons,
  .holiday-status-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .holiday-scope-buttons button,
  .holiday-status-buttons button {
    min-height: 43px;
    padding: 0 16px;
    border: 0;
    border-radius: 14px;
    color: #696b72;
    background: #f0f1f5;
    font: inherit;
    font-size: 13px;
    font-weight: 850;
    cursor: pointer;
  }

  .holiday-scope-buttons button.selected,
  .holiday-status-buttons button.selected {
    color: white;
    background: linear-gradient(125deg,#078df8,#00afd8);
  }

  .holiday-history-row {
    padding: 20px;
    border: 1px solid #e7e8ec;
    border-radius: 24px;
    background: #fafafd;
  }

  .holiday-history-details {
    margin-top: 18px;
    display: grid;
    grid-template-columns: repeat(5,1fr);
    gap: 10px;
  }

  .holiday-history-detail {
    padding: 13px;
    border-radius: 16px;
    background: #f0f1f5;
  }

  .holiday-history-detail span,
  .holiday-history-reason > span,
  .holiday-admin-response > span {
    color: #96989f;
    font-size: 9px;
    font-weight: 950;
    letter-spacing: .4px;
    text-transform: uppercase;
  }

  .holiday-history-detail strong {
    display: block;
    margin-top: 5px;
    font-size: 12px;
    font-weight: 900;
  }

  .holiday-history-bottom {
    margin-top: 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .holiday-history-reason {
    flex: 1;
    padding: 15px;
    border-radius: 17px;
    background: #f4f5f8;
  }

  .holiday-history-reason p,
  .holiday-admin-response p {
    margin: 7px 0 0;
    color: #656870;
    line-height: 1.5;
    font-size: 13px;
  }

  .holiday-admin-response {
    margin-top: 13px;
    padding: 15px;
    border-radius: 17px;
    color: #147b3d;
    background: #e4f8eb;
  }

  @media (max-width: 1000px) {
    .holiday-topbar {
      grid-template-columns: auto 1fr;
    }

    .holiday-new {
      grid-column: 1 / -1;
      width: 100%;
    }

    .holiday-stats {
      grid-template-columns: repeat(2,1fr);
    }

    .holiday-team-row {
      grid-template-columns: auto 1fr auto;
    }

    .holiday-date-box,
    .holiday-date-arrow {
      grid-column: auto;
    }

    .holiday-history-details {
      grid-template-columns: repeat(2,1fr);
    }
  }

  @media (max-width: 700px) {
    .holiday-page {
      padding: 10px;
    }

    .holiday-topbar {
      padding: 19px;
      grid-template-columns: 1fr;
      border-radius: 26px;
    }

    .holiday-topbar-title {
      text-align: left;
    }

    .holiday-back,
    .holiday-new {
      width: 100%;
    }

    .holiday-hero {
      padding: 27px 24px;
      border-radius: 30px;
    }

    .holiday-card {
      padding: 22px;
      border-radius: 29px;
    }

    .holiday-team-banner {
      padding: 24px;
      align-items: flex-start;
      flex-direction: column;
      border-radius: 27px;
    }

    .holiday-away-count {
      width: 100%;
    }

    .holiday-team-row {
      grid-template-columns: 1fr;
    }

    .holiday-date-arrow {
      display: none;
    }

    .holiday-team-badges {
      align-items: flex-start;
      flex-direction: row;
    }

    .holiday-history-details {
      grid-template-columns: 1fr;
    }

    .holiday-history-bottom {
      flex-direction: column;
    }
  }

  @media (max-width: 430px) {
    .holiday-stats {
      gap: 9px;
    }

    .holiday-stat {
      min-height: 108px;
    }

    .holiday-stat strong {
      font-size: 32px;
    }

    .holiday-balance-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: 15px;
    }

    .holiday-balance-footer > div:last-child {
      text-align: left;
    }
  }
`;