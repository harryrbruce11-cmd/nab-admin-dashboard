// src/holidays/HolidayRequestDialog.jsx

// src/holidays/HolidayRequestDialog.jsx

// src/holidays/HolidayRequestDialog.jsx

// src/holidays/HolidayRequestDialog.jsx

// src/holidays/HolidayRequestDialog.jsx

// src/holidays/HolidayRequestDialog.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import {
  mainAuth,
  mainDb,
  vehicleCheckDb,
} from "../firebase";

const DEFAULT_ALLOWANCE = 20;
const EARLIEST_HOLIDAY_YEAR = 2025;
const LATEST_HOLIDAY_YEAR = new Date().getFullYear() + 1;

export default function HolidayRequestDialog({
  open,
  onClose,
  onSubmitted,
}) {
  const [firebaseUser, setFirebaseUser] =
    useState(null);

  const [userProfile, setUserProfile] =
    useState(null);

  const [holidayRequests, setHolidayRequests] =
    useState([]);

  const [loadingUser, setLoadingUser] =
    useState(true);

  const [loadingProfile, setLoadingProfile] =
    useState(false);

  const [loadingRequests, setLoadingRequests] =
    useState(true);

  const [firstDayOff, setFirstDayOff] =
    useState("");

  const [lastDayOff, setLastDayOff] =
    useState("");

  const [holidayYear, setHolidayYear] =
    useState(() => Math.max(
      new Date().getFullYear(),
      EARLIEST_HOLIDAY_YEAR
    ));

  const [reason, setReason] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | Signed-in Harry Bruce Firebase user
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      mainAuth,
      (user) => {
        setFirebaseUser(user);
        setLoadingUser(false);
      },
      (error) => {
        console.error(
          "Could not load the signed-in user:",
          error
        );

        setFirebaseUser(null);
        setLoadingUser(false);

        setErrorMessage(
          "The signed-in Firebase user could not be loaded."
        );
      }
    );

    return unsubscribe;
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Load or automatically create the user's main Firestore profile
  |--------------------------------------------------------------------------
  |
  | Reads and creates:
  |
  | harry-bruce-gaming-ltd
  | users
  | {signed-in user's UID}
  |
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

        const fallbackName =
          firebaseUser.displayName ||
          getNameFromEmail(firebaseUser.email) ||
          "User";

        const newProfile = {
          uid: firebaseUser.uid,

          displayName: fallbackName,

          name: fallbackName,

          email: firebaseUser.email || "",

          annualAllowance:
            DEFAULT_ALLOWANCE,

          holidayAllowance:
            DEFAULT_ALLOWANCE,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        };

        try {
          await setDoc(
            userReference,
            newProfile,
            {
              merge: true,
            }
          );

          setUserProfile({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            displayName: fallbackName,
            name: fallbackName,
            email: firebaseUser.email || "",
            annualAllowance:
              DEFAULT_ALLOWANCE,
            holidayAllowance:
              DEFAULT_ALLOWANCE,
          });
        } catch (error) {
          console.error(
            "Could not create the user holiday profile:",
            error
          );

          /*
           * Continue using a temporary local profile so the form still works.
           */
          setUserProfile({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            displayName: fallbackName,
            name: fallbackName,
            email: firebaseUser.email || "",
            annualAllowance:
              DEFAULT_ALLOWANCE,
            holidayAllowance:
              DEFAULT_ALLOWANCE,
          });

          setErrorMessage(
            "The user profile could not be created, so the default holiday allowance is being used."
          );
        } finally {
          creatingProfile = false;
          setLoadingProfile(false);
        }
      },
      (error) => {
        console.error(
          "Could not load the user profile:",
          error
        );

        const fallbackName =
          firebaseUser.displayName ||
          getNameFromEmail(firebaseUser.email) ||
          "User";

        setUserProfile({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          displayName: fallbackName,
          name: fallbackName,
          email: firebaseUser.email || "",
          annualAllowance:
            DEFAULT_ALLOWANCE,
          holidayAllowance:
            DEFAULT_ALLOWANCE,
        });

        setLoadingProfile(false);
      }
    );

    return unsubscribe;
  }, [firebaseUser?.uid]);

  /*
  |--------------------------------------------------------------------------
  | Load holiday requests from Vehicle Check Firestore
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(
        vehicleCheckDb,
        "holidayRequests"
      ),
      (snapshot) => {
        const loadedRequests =
          snapshot.docs.map(
            (requestDocument) => ({
              id: requestDocument.id,
              ...requestDocument.data(),
            })
          );

        setHolidayRequests(
          loadedRequests
        );

        setLoadingRequests(false);
      },
      (error) => {
        console.error(
          "Could not load Vehicle Check holiday requests:",
          error
        );

        setLoadingRequests(false);

        setErrorMessage(
          "Existing holiday requests could not be loaded from Vehicle Check."
        );
      }
    );

    return unsubscribe;
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Reset form when opened
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!open) {
      return;
    }

    setFirstDayOff("");
    setLastDayOff("");
    setHolidayYear(
      Math.max(
        new Date().getFullYear(),
        EARLIEST_HOLIDAY_YEAR
      )
    );
    setReason("");
    setSaving(false);
    setErrorMessage("");
    setSuccessMessage("");
  }, [open]);

  /*
  |--------------------------------------------------------------------------
  | Signed-in user details
  |--------------------------------------------------------------------------
  */

  const displayUserName = useMemo(() => {
    return (
      userProfile?.displayName ||
      userProfile?.employeeName ||
      userProfile?.name ||
      userProfile?.userName ||
      firebaseUser?.displayName ||
      getNameFromEmail(
        firebaseUser?.email
      ) ||
      firebaseUser?.email ||
      "Signed-in user"
    );
  }, [
    firebaseUser,
    userProfile,
  ]);

  const displayUserEmail = useMemo(() => {
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

  /*
  |--------------------------------------------------------------------------
  | User allowance from Harry Bruce Firestore
  |--------------------------------------------------------------------------
  */

  const annualAllowance = useMemo(() => {
    const yearlyAllowances =
      userProfile?.holidayAllowances ||
      userProfile?.annualAllowances ||
      {};

    return findNumber(
      [
        yearlyAllowances?.[holidayYear],
        userProfile?.[`annualAllowance${holidayYear}`],
        userProfile?.[`holidayAllowance${holidayYear}`],
        userProfile?.annualAllowance,
        userProfile?.holidayAllowance,
        userProfile?.allowance,
        userProfile?.totalHolidayDays,
      ],
      DEFAULT_ALLOWANCE
    );
  }, [userProfile, holidayYear]);

  /*
  |--------------------------------------------------------------------------
  | Holiday requests belonging to the signed-in user
  |--------------------------------------------------------------------------
  */

  const currentUserRequests = useMemo(() => {
    if (!firebaseUser?.uid) {
      return [];
    }

    return holidayRequests.filter(
      (request) => {
        const requestUid =
          request.uid ||
          request.userId ||
          request.employeeUid ||
          "";

        const requestStartDate =
          request.firstDayOff ??
          request.startDate ??
          request.dateOfRequest ??
          null;

        const requestDate =
          parseDate(requestStartDate);

        const requestYear =
          Number(request.holidayYear) ||
          requestDate?.getFullYear();

        return (
          String(requestUid) ===
            String(firebaseUser.uid) &&
          requestYear === Number(holidayYear)
        );
      }
    );
  }, [
    holidayRequests,
    firebaseUser?.uid,
    holidayYear,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Only approved requests count as used days
  |--------------------------------------------------------------------------
  */

  const usedDays = useMemo(() => {
    return currentUserRequests
      .filter(
        (request) =>
          normaliseStatus(
            request.status
          ) === "approved"
      )
      .reduce(
        (total, request) =>
          total +
          getRequestWorkingDays(
            request
          ),
        0
      );
  }, [currentUserRequests]);

  const pendingDays = useMemo(() => {
    return currentUserRequests
      .filter(
        (request) =>
          normaliseStatus(
            request.status
          ) === "pending"
      )
      .reduce(
        (total, request) =>
          total +
          getRequestWorkingDays(
            request
          ),
        0
      );
  }, [currentUserRequests]);

  const remainingDays = Math.max(
    annualAllowance - usedDays,
    0
  );

  /*
  |--------------------------------------------------------------------------
  | Date calculations
  |--------------------------------------------------------------------------
  */

  const workingDays = useMemo(() => {
    return calculateWorkingDays(
      firstDayOff,
      lastDayOff
    );
  }, [
    firstDayOff,
    lastDayOff,
  ]);

  const returnToWorkDate = useMemo(() => {
    return calculateReturnToWorkDate(
      lastDayOff
    );
  }, [lastDayOff]);

  const remainingAfterRequest =
    Math.max(
      remainingDays - workingDays,
      0
    );

  const minimumHolidayDate =
    `${holidayYear}-01-01`;

  const maximumHolidayDate =
    `${holidayYear}-12-31`;

  const availableHolidayYears = useMemo(() => {
    const years = [];

    for (
      let year = EARLIEST_HOLIDAY_YEAR;
      year <= LATEST_HOLIDAY_YEAR;
      year += 1
    ) {
      years.push(year);
    }

    return years;
  }, []);

  const invalidDateRange =
    Boolean(firstDayOff) &&
    Boolean(lastDayOff) &&
    Boolean(parseDate(firstDayOff)) &&
    Boolean(parseDate(lastDayOff)) &&
    parseDate(lastDayOff) <
      parseDate(firstDayOff);

  const datesOutsideSelectedYear =
    Boolean(firstDayOff) &&
    Boolean(lastDayOff) &&
    (
      parseDate(firstDayOff)?.getFullYear() !==
        Number(holidayYear) ||
      parseDate(lastDayOff)?.getFullYear() !==
        Number(holidayYear)
    );

  const exceedsAllowance =
    workingDays > remainingDays;

  const canSubmit =
    Boolean(firebaseUser) &&
    Boolean(firstDayOff) &&
    Boolean(lastDayOff) &&
    workingDays > 0 &&
    !invalidDateRange &&
    !datesOutsideSelectedYear &&
    !exceedsAllowance &&
    !loadingUser &&
    !loadingProfile &&
    !saving;

  function handleHolidayYearChange(
    event
  ) {
    const selectedYear = Number(
      event.target.value
    );

    setHolidayYear(selectedYear);
    setFirstDayOff("");
    setLastDayOff("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleFirstDayChange(
    event
  ) {
    const selectedDate =
      event.target.value;

    setFirstDayOff(selectedDate);
    setErrorMessage("");
    setSuccessMessage("");

    if (
      selectedDate &&
      lastDayOff &&
      parseDate(lastDayOff) <
        parseDate(selectedDate)
    ) {
      setLastDayOff(selectedDate);
    }
  }

  function handleLastDayChange(
    event
  ) {
    setLastDayOff(
      event.target.value
    );

    setErrorMessage("");
    setSuccessMessage("");
  }

  function closeDialog() {
    if (saving) {
      return;
    }

    onClose?.();
  }

  /*
  |--------------------------------------------------------------------------
  | Submit request to Vehicle Check Firestore
  |--------------------------------------------------------------------------
  */

  async function submitRequest(
    event
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!firebaseUser) {
      setErrorMessage(
        "You must be signed in before submitting a holiday request."
      );
      return;
    }

    if (
      !firstDayOff ||
      !lastDayOff
    ) {
      setErrorMessage(
        "Please select the first and last day off."
      );
      return;
    }

    if (invalidDateRange) {
      setErrorMessage(
        "The last day off cannot be before the first day off."
      );
      return;
    }

    if (datesOutsideSelectedYear) {
      setErrorMessage(
        `Both holiday dates must be inside ${holidayYear}.`
      );
      return;
    }

    if (workingDays < 1) {
      setErrorMessage(
        "The selected dates do not contain any working days."
      );
      return;
    }

    if (exceedsAllowance) {
      setErrorMessage(
        `This request is for ${workingDays} working days, but only ${remainingDays} days are available.`
      );
      return;
    }

    const firstDate =
      parseDate(firstDayOff);

    const lastDate =
      parseDate(lastDayOff);

    const returnDate =
      parseDate(
        returnToWorkDate
      );

    if (
      !firstDate ||
      !lastDate ||
      !returnDate
    ) {
      setErrorMessage(
        "The selected dates are not valid."
      );
      return;
    }

    setSaving(true);

    try {
      const requestData = {
        uid: firebaseUser.uid,

        userId: firebaseUser.uid,

        authProject:
          "harry-bruce-gaming-ltd",

        destinationProject:
          "vehicle-check-ebdbf",

        employeeName:
          displayUserName,

        userName:
          displayUserName,

        userEmail:
          displayUserEmail,

        annualAllowance,

        holidayYear:
          Number(holidayYear),

        dateOfRequest:
          Timestamp.fromDate(
            new Date()
          ),

        firstDayOff:
          Timestamp.fromDate(
            startOfDay(firstDate)
          ),

        lastDayOff:
          Timestamp.fromDate(
            startOfDay(lastDate)
          ),

        returnToWorkDate:
          Timestamp.fromDate(
            startOfDay(returnDate)
          ),

        totalWorkingDaysAbsent:
          String(workingDays),

        workingDays,

        approvedUsedDays:
          usedDays,

        pendingDaysBeforeRequest:
          pendingDays,

        remainingBeforeRequest:
          remainingDays,

        remainingAfterRequest,

        reason:
          reason.trim(),

        status:
          "Pending",

        approvedBy: "",
        approvedByUid: "",
        approvedByEmail: "",
        approvedAt: null,

        rejectedBy: "",
        rejectedByUid: "",
        rejectedByEmail: "",
        rejectedAt: null,

        reviewedBy: "",
        reviewedByUid: "",
        reviewedAt: null,

        adminComment: "",
        comment: "",

        notificationRead:
          false,

        pushNotificationPending:
          false,

        pushNotificationSent:
          false,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      };

      const requestReference =
        await addDoc(
          collection(
            vehicleCheckDb,
            "holidayRequests"
          ),
          requestData
        );

      setSuccessMessage(
        "Your holiday request has been submitted."
      );

      onSubmitted?.({
        id:
          requestReference.id,
        ...requestData,
      });

      window.setTimeout(() => {
        onClose?.();
      }, 1000);
    } catch (error) {
      console.error(
        "Holiday request submission failed:",
        error
      );

      if (
        error?.code ===
        "permission-denied"
      ) {
        setErrorMessage(
          "Vehicle Check Firestore denied this request. The Vehicle Check security rules must allow the admin dashboard to create holiday requests."
        );
      } else {
        setErrorMessage(
          error?.message ||
            "Your holiday request could not be submitted."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="holiday-request-overlay">
      <style>
        {holidayRequestStyles}
      </style>

      <section
        className="holiday-request-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="holiday-request-title"
      >
        <header className="holiday-request-navigation">
          <button
            type="button"
            onClick={closeDialog}
            disabled={saving}
          >
            Cancel
          </button>

          <h1 id="holiday-request-title">
            Request Holiday
          </h1>

          <div />
        </header>

        <form
          className="holiday-request-content"
          onSubmit={submitRequest}
        >
          <section className="holiday-request-hero">
            <div className="holiday-request-hero-top">
              <div className="holiday-request-hero-icon">
                <CalendarPlusIcon />
              </div>

              <span>
                Pending
              </span>
            </div>

            <h2>
              Holiday Request Form
            </h2>

            <p>
              Choose your dates and submit
              for approval.
            </p>
          </section>

          <section className="holiday-request-card">
            <div className="holiday-card-title-row">
              <h2>
                Holiday Allowance
              </h2>

              <span className="holiday-year-badge">
                {holidayYear}
              </span>
            </div>

            <div className="holiday-allowance-grid">
              <AllowanceCard
                value={annualAllowance}
                label="Allowance"
                type="blue"
              />

              <AllowanceCard
                value={usedDays}
                label="Used"
                type="orange"
              />

              <AllowanceCard
                value={remainingDays}
                label="Left"
                type="green"
              />
            </div>

            <div className="holiday-divider" />

            <div className="holiday-allowance-summary">
              <div>
                <span>
                  This request
                </span>

                <strong>
                  {workingDays}{" "}
                  {workingDays === 1
                    ? "working day"
                    : "working days"}
                </strong>
              </div>

              <div>
                <span>
                  Remaining after
                </span>

                <strong
                  className={
                    exceedsAllowance
                      ? "holiday-negative-value"
                      : ""
                  }
                >
                  {remainingAfterRequest}{" "}
                  {remainingAfterRequest === 1
                    ? "day"
                    : "days"}
                </strong>
              </div>
            </div>

            {pendingDays > 0 && (
              <div className="holiday-pending-note">
                <span>
                  Pending requests
                </span>

                <strong>
                  {pendingDays}{" "}
                  {pendingDays === 1
                    ? "day"
                    : "days"}
                </strong>
              </div>
            )}

            {exceedsAllowance && (
              <div className="holiday-inline-warning">
                <WarningIcon />

                <span>
                  This request is greater
                  than the remaining
                  holiday allowance.
                </span>
              </div>
            )}
          </section>

          <section className="holiday-request-card">
            <h2>
              Request Details
            </h2>

            <FieldLabel
              icon={<CalendarIcon />}
              label="Holiday Year"
            />

            <select
              className="holiday-year-select"
              value={holidayYear}
              onChange={handleHolidayYearChange}
              disabled={saving}
            >
              {availableHolidayYears.map(
                (year) => (
                  <option
                    key={year}
                    value={year}
                  >
                    {year}
                  </option>
                )
              )}
            </select>

            <div className="holiday-year-note">
              You can submit or record holiday requests from 2025 onwards.
            </div>

            <FieldLabel
              icon={<PersonIcon />}
              label="Name"
            />

            <div className="holiday-readonly-field">
              {loadingUser ||
              loadingProfile
                ? "Loading user..."
                : displayUserName}
            </div>

            <FieldLabel
              icon={<CalendarIcon />}
              label="Date of request"
            />

            <div className="holiday-readonly-field">
              {formatDate(
                new Date()
              )}
            </div>

            <FieldLabel
              icon={<WalkingIcon />}
              label="1st day off"
            />

            <input
              className="holiday-date-input"
              type="date"
              value={firstDayOff}
              min={minimumHolidayDate}
              max={maximumHolidayDate}
              onChange={
                handleFirstDayChange
              }
              disabled={saving}
            />

            <FieldLabel
              icon={<WalkingIcon />}
              label="Last day off"
            />

            <input
              className="holiday-date-input"
              type="date"
              value={lastDayOff}
              min={
                firstDayOff ||
                minimumHolidayDate
              }
              max={maximumHolidayDate}
              onChange={
                handleLastDayChange
              }
              disabled={saving}
            />

            <FieldLabel
              icon={<BriefcaseIcon />}
              label="Return to work date"
            />

            <div className="holiday-readonly-field">
              {returnToWorkDate
                ? formatDate(
                    returnToWorkDate
                  )
                : "Select the last day off"}
            </div>

            <FieldLabel
              icon={<NumberIcon />}
              label="Total working days absent"
            />

            <div className="holiday-readonly-field holiday-total-days">
              {workingDays}
            </div>

            {invalidDateRange && (
              <div className="holiday-inline-error">
                The last day off cannot be
                before the first day off.
              </div>
            )}

            {datesOutsideSelectedYear && (
              <div className="holiday-inline-error">
                Both dates must be inside
                the selected holiday year,
                {` ${holidayYear}.`}
              </div>
            )}
          </section>

          <section className="holiday-request-card">
            <div className="holiday-reason-heading">
              <MessageIcon />

              <h2>
                Reason
              </h2>
            </div>

            <textarea
              value={reason}
              rows={5}
              maxLength={500}
              placeholder="Reason for holiday"
              disabled={saving}
              onChange={(event) => {
                setReason(
                  event.target.value
                );

                setErrorMessage("");
                setSuccessMessage("");
              }}
            />

            <div className="holiday-character-count">
              {reason.length}/500
            </div>
          </section>

          {errorMessage && (
            <div className="holiday-message holiday-error">
              <WarningIcon />

              <span>
                {errorMessage}
              </span>
            </div>
          )}

          {successMessage && (
            <div className="holiday-message holiday-success">
              <CheckIcon />

              <span>
                {successMessage}
              </span>
            </div>
          )}

          <div className="holiday-submit-panel">
            <button
              type="submit"
              disabled={!canSubmit}
            >
              {saving
                ? "Submitting Holiday Request..."
                : "Submit Holiday Request"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AllowanceCard({
  value,
  label,
  type,
}) {
  return (
    <div
      className={`holiday-allowance-card holiday-allowance-${type}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function FieldLabel({
  icon,
  label,
}) {
  return (
    <div className="holiday-field-label">
      {icon}

      <span>
        {label}
      </span>
    </div>
  );
}

function getNameFromEmail(email) {
  if (!email) {
    return "";
  }

  const emailName =
    String(email)
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .trim();

  return emailName
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function getRequestWorkingDays(
  request
) {
  const storedValue = Number(
    request.totalWorkingDaysAbsent ??
      request.workingDays
  );

  if (
    Number.isFinite(storedValue)
  ) {
    return Math.max(
      storedValue,
      0
    );
  }

  return calculateWorkingDays(
    request.firstDayOff ??
      request.startDate,
    request.lastDayOff ??
      request.endDate
  );
}

function findNumber(
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

    const numberValue =
      Number(value);

    if (
      Number.isFinite(
        numberValue
      )
    ) {
      return Math.max(
        numberValue,
        0
      );
    }
  }

  return fallback;
}

function calculateWorkingDays(
  startValue,
  endValue
) {
  const start =
    parseDate(startValue);

  const end =
    parseDate(endValue);

  if (
    !start ||
    !end ||
    end < start
  ) {
    return 0;
  }

  const current =
    startOfDay(start);

  const finalDate =
    startOfDay(end);

  let total = 0;

  while (
    current <= finalDate
  ) {
    const weekday =
      current.getDay();

    if (
      weekday !== 0 &&
      weekday !== 6
    ) {
      total += 1;
    }

    current.setDate(
      current.getDate() + 1
    );
  }

  return total;
}

function calculateReturnToWorkDate(
  lastDayValue
) {
  const lastDay =
    parseDate(lastDayValue);

  if (!lastDay) {
    return "";
  }

  const returnDate =
    startOfDay(lastDay);

  returnDate.setDate(
    returnDate.getDate() + 1
  );

  while (
    returnDate.getDay() === 0 ||
    returnDate.getDay() === 6
  ) {
    returnDate.setDate(
      returnDate.getDate() + 1
    );
  }

  return toDateInputValue(
    returnDate
  );
}

function normaliseStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  if (
    typeof value === "object" &&
    value.seconds !== undefined
  ) {
    return new Date(
      Number(value.seconds) *
        1000
    );
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    const [
      year,
      month,
      day,
    ] = value
      .split("-")
      .map(Number);

    return new Date(
      year,
      month - 1,
      day
    );
  }

  const parsedDate =
    new Date(value);

  return Number.isNaN(
    parsedDate.getTime()
  )
    ? null
    : parsedDate;
}

function startOfDay(date) {
  const result =
    new Date(date);

  result.setHours(
    0,
    0,
    0,
    0
  );

  return result;
}

function getTodayInputValue() {
  return toDateInputValue(
    new Date()
  );
}

function toDateInputValue(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const date =
    parseDate(value);

  if (!date) {
    return "";
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

function CalendarPlusIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect
        x="3"
        y="4"
        width="15"
        height="15"
        rx="2"
      />

      <path d="M7 2v4M14 2v4M3 8h15" />

      <circle
        cx="18"
        cy="18"
        r="4"
      />

      <path d="M18 16v4M16 18h4" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="8"
        r="4"
      />

      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
      />

      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function WalkingIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle
        cx="13"
        cy="4"
        r="2"
      />

      <path d="m10 22 2-7-3-3 2-5 4 3 3 1" />

      <path d="m15 22-2-6M5 12l4-2" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect
        x="2"
        y="7"
        width="20"
        height="13"
        rx="2"
      />

      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20" />
    </svg>
  );
}

function NumberIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="9"
      />

      <path d="m10 7-2 10M16 7l-2 10M7 11h10M6 15h10" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />

      <path d="M7 9h10M7 13h7" />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="9"
      />

      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

const holidayRequestStyles = `
  * {
    box-sizing: border-box;
  }

  .holiday-request-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    padding: 18px;
    overflow-y: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: rgba(20, 22, 29, 0.5);
    backdrop-filter: blur(10px);
  }

  .holiday-request-dialog {
    width: min(100%, 850px);
    margin: auto;
    overflow: hidden;
    border-radius: 42px;
    color: #111216;
    background: #f2f3f8;
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.28);
    font-family:
      Inter,
      -apple-system,
      BlinkMacSystemFont,
      "SF Pro Display",
      "Segoe UI",
      sans-serif;
  }

  .holiday-request-navigation {
    min-height: 116px;
    padding: 27px 34px 21px;
    display: grid;
    grid-template-columns: 120px 1fr 120px;
    align-items: center;
    background: rgba(249, 250, 253, 0.96);
  }

  .holiday-request-navigation button {
    justify-self: start;
    min-height: 52px;
    padding: 0 15px;
    border: 1px solid #d7d8de;
    border-radius: 999px;
    color: #111216;
    background: rgba(255, 255, 255, 0.75);
    font: inherit;
    font-size: 17px;
    font-weight: 850;
    text-decoration: underline;
    cursor: pointer;
  }

  .holiday-request-navigation button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .holiday-request-navigation h1 {
    margin: 0;
    text-align: center;
    font-size: 30px;
    letter-spacing: -0.7px;
    font-weight: 950;
  }

  .holiday-request-content {
    padding: 0 30px 30px;
  }

  .holiday-request-hero {
    padding: 41px 42px 39px;
    border-radius: 35px;
    color: white;
    background:
      linear-gradient(
        125deg,
        #078df9,
        #00bad8
      );
    box-shadow:
      0 23px 44px
      rgba(0, 139, 245, 0.2);
  }

  .holiday-request-hero-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .holiday-request-hero-icon {
    width: 86px;
    height: 86px;
    display: grid;
    place-items: center;
    border-radius: 25px;
    background:
      rgba(255, 255, 255, 0.18);
  }

  .holiday-request-hero-icon svg {
    width: 48px;
    height: 48px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .holiday-request-hero-top > span {
    margin-top: 9px;
    padding: 10px 20px;
    border-radius: 999px;
    background:
      rgba(255, 255, 255, 0.17);
    font-size: 16px;
    font-weight: 900;
  }

  .holiday-request-hero h2 {
    margin: 30px 0 9px;
    font-size: clamp(
      32px,
      5vw,
      48px
    );
    line-height: 1.04;
    letter-spacing: -1.5px;
    font-weight: 950;
  }

  .holiday-request-hero p {
    margin: 0;
    color:
      rgba(255, 255, 255, 0.92);
    font-size: 21px;
    font-weight: 650;
  }

  .holiday-request-card {
    margin-top: 26px;
    padding: 31px;
    border-radius: 35px;
    background: white;
    box-shadow:
      0 15px 40px
      rgba(17, 24, 39, 0.045);
  }

  .holiday-request-card > h2,
  .holiday-reason-heading h2,
  .holiday-card-title-row h2 {
    margin: 0;
    font-size: 30px;
    letter-spacing: -0.6px;
    font-weight: 950;
  }

  .holiday-card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .holiday-year-badge {
    min-width: 72px;
    min-height: 42px;
    padding: 0 14px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: #078af4;
    background: #e5f3ff;
    font-size: 16px;
    font-weight: 950;
  }

  .holiday-year-select {
    width: 100%;
    min-height: 104px;
    padding: 0 30px;
    border: 2px solid transparent;
    border-radius: 27px;
    outline: none;
    color: #111216;
    background: #f0f1f6;
    font: inherit;
    font-size: 24px;
    font-weight: 750;
    cursor: pointer;
  }

  .holiday-year-select:focus {
    border-color: #0a91f5;
    background: white;
    box-shadow:
      0 0 0 5px
      rgba(10, 145, 245, 0.12);
  }

  .holiday-year-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .holiday-year-note {
    margin-top: 10px;
    padding: 12px 15px;
    border-radius: 15px;
    color: #0871c9;
    background: #eaf5ff;
    font-size: 13px;
    font-weight: 750;
  }

  .holiday-allowance-grid {
    margin-top: 26px;
    display: grid;
    grid-template-columns:
      repeat(3, 1fr);
    gap: 20px;
  }

  .holiday-allowance-card {
    min-height: 137px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 27px;
  }

  .holiday-allowance-card strong {
    font-size: 48px;
    line-height: 1;
    font-weight: 950;
  }

  .holiday-allowance-card span {
    margin-top: 12px;
    color: #7c7e85;
    font-size: 17px;
    font-weight: 850;
  }

  .holiday-allowance-blue {
    color: #078af4;
    background: #e5f3ff;
  }

  .holiday-allowance-orange {
    color: #ff7d1b;
    background: #fff2e8;
  }

  .holiday-allowance-green {
    color: #25c45d;
    background: #e9f9ee;
  }

  .holiday-divider {
    height: 1px;
    margin: 27px 0 22px;
    background: #dddddf;
  }

  .holiday-allowance-summary {
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }

  .holiday-allowance-summary > div {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .holiday-allowance-summary > div:last-child {
    text-align: right;
  }

  .holiday-allowance-summary span {
    color: #94959c;
    font-size: 16px;
    font-weight: 800;
  }

  .holiday-allowance-summary strong {
    font-size: 21px;
    font-weight: 950;
  }

  .holiday-allowance-summary > div:last-child strong {
    color: #ff2e3f;
  }

  .holiday-negative-value {
    color: #c71f31 !important;
  }

  .holiday-pending-note {
    margin-top: 18px;
    padding: 14px 17px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 17px;
    color: #8e5800;
    background: #fff1dc;
  }

  .holiday-pending-note span {
    font-size: 13px;
    font-weight: 800;
  }

  .holiday-pending-note strong {
    font-size: 15px;
    font-weight: 950;
  }

  .holiday-inline-warning {
    margin-top: 17px;
    padding: 15px 17px;
    display: flex;
    align-items: center;
    gap: 11px;
    border-radius: 17px;
    color: #a45800;
    background: #fff0d8;
    font-size: 14px;
    font-weight: 800;
  }

  .holiday-inline-warning svg {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.1;
  }

  .holiday-field-label {
    margin: 28px 0 12px 2px;
    display: flex;
    align-items: center;
    gap: 13px;
    color: #909198;
    font-size: 17px;
    font-weight: 950;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  .holiday-field-label svg {
    width: 25px;
    height: 25px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .holiday-readonly-field,
  .holiday-date-input {
    width: 100%;
    min-height: 104px;
    padding: 0 30px;
    border: 2px solid transparent;
    border-radius: 27px;
    color: #111216;
    background: #f0f1f6;
    font: inherit;
    font-size: 24px;
    font-weight: 750;
  }

  .holiday-readonly-field {
    display: flex;
    align-items: center;
  }

  .holiday-date-input {
    outline: none;
    color-scheme: light;
  }

  .holiday-date-input:focus {
    border-color: #0a91f5;
    background: white;
    box-shadow:
      0 0 0 5px
      rgba(10, 145, 245, 0.12);
  }

  .holiday-date-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .holiday-total-days {
    font-size: 33px;
    font-weight: 950;
  }

  .holiday-inline-error {
    margin-top: 15px;
    padding: 14px 16px;
    border-radius: 16px;
    color: #b41727;
    background: #ffe8eb;
    font-size: 14px;
    font-weight: 800;
  }

  .holiday-reason-heading {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .holiday-reason-heading svg {
    width: 30px;
    height: 30px;
    fill: none;
    stroke: #111216;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .holiday-request-card textarea {
    width: 100%;
    min-height: 190px;
    margin-top: 24px;
    padding: 27px 30px;
    resize: vertical;
    border: 2px solid transparent;
    border-radius: 27px;
    outline: none;
    color: #111216;
    background: #f0f1f6;
    font: inherit;
    font-size: 20px;
    line-height: 1.5;
  }

  .holiday-request-card textarea::placeholder {
    color: #bfc0c7;
  }

  .holiday-request-card textarea:focus {
    border-color: #0a91f5;
    background: white;
    box-shadow:
      0 0 0 5px
      rgba(10, 145, 245, 0.12);
  }

  .holiday-character-count {
    margin-top: 8px;
    color: #9a9ca3;
    text-align: right;
    font-size: 11px;
    font-weight: 700;
  }

  .holiday-message {
    margin-top: 20px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 18px;
    font-size: 15px;
    font-weight: 800;
  }

  .holiday-message svg {
    width: 23px;
    height: 23px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
  }

  .holiday-error {
    color: #b41727;
    background: #ffe8eb;
  }

  .holiday-success {
    color: #117d3b;
    background: #e4f8eb;
  }

  .holiday-submit-panel {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: 34px;
    padding: 13px;
    border-radius: 38px;
    background:
      rgba(226, 227, 234, 0.96);
    backdrop-filter: blur(20px);
  }

  .holiday-submit-panel button {
    width: 100%;
    min-height: 92px;
    border: 0;
    border-radius: 29px;
    color: white;
    background:
      linear-gradient(
        125deg,
        #078df8,
        #00afd8
      );
    box-shadow:
      0 15px 32px
      rgba(0, 142, 242, 0.24);
    font: inherit;
    font-size: 24px;
    font-weight: 950;
    cursor: pointer;
  }

  .holiday-submit-panel button:disabled {
    color:
      rgba(255, 255, 255, 0.8);
    background: #c3c4cb;
    box-shadow: none;
    cursor: not-allowed;
  }

  @media (max-width: 700px) {
    .holiday-request-overlay {
      padding: 0;
      align-items: stretch;
      background: #c8c8cc;
    }

    .holiday-request-dialog {
      width: 100%;
      min-height: 100vh;
      margin: 0;
      border-radius:
        38px 38px 0 0;
      box-shadow: none;
    }

    .holiday-request-navigation {
      min-height: 112px;
      padding: 24px 19px 18px;
      grid-template-columns:
        90px 1fr 90px;
    }

    .holiday-request-navigation h1 {
      font-size: 22px;
    }

    .holiday-request-navigation button {
      min-height: 49px;
      padding: 0 10px;
      font-size: 16px;
    }

    .holiday-request-content {
      padding: 0 17px 24px;
    }

    .holiday-request-hero {
      padding: 27px 23px 30px;
      border-radius: 30px;
    }

    .holiday-request-hero-icon {
      width: 68px;
      height: 68px;
      border-radius: 20px;
    }

    .holiday-request-hero-icon svg {
      width: 39px;
      height: 39px;
    }

    .holiday-request-hero-top > span {
      padding: 8px 15px;
      font-size: 13px;
    }

    .holiday-request-hero h2 {
      margin-top: 24px;
      font-size: 34px;
    }

    .holiday-request-hero p {
      font-size: 17px;
    }

    .holiday-request-card {
      margin-top: 21px;
      padding: 24px 20px;
      border-radius: 29px;
    }

    .holiday-request-card > h2,
    .holiday-reason-heading h2,
    .holiday-card-title-row h2 {
      font-size: 24px;
    }

    .holiday-year-select {
      min-height: 88px;
      padding: 0 22px;
      border-radius: 23px;
      font-size: 20px;
    }

    .holiday-year-note {
      font-size: 12px;
    }

    .holiday-allowance-grid {
      gap: 10px;
      margin-top: 22px;
    }

    .holiday-allowance-card {
      min-height: 111px;
      border-radius: 22px;
    }

    .holiday-allowance-card strong {
      font-size: 35px;
    }

    .holiday-allowance-card span {
      margin-top: 8px;
      font-size: 13px;
    }

    .holiday-allowance-summary span {
      font-size: 13px;
    }

    .holiday-allowance-summary strong {
      font-size: 17px;
    }

    .holiday-field-label {
      margin-top: 24px;
      font-size: 14px;
    }

    .holiday-readonly-field,
    .holiday-date-input {
      min-height: 88px;
      padding: 0 22px;
      border-radius: 23px;
      font-size: 20px;
    }

    .holiday-total-days {
      font-size: 30px;
    }

    .holiday-request-card textarea {
      min-height: 175px;
      padding: 24px 22px;
      border-radius: 23px;
      font-size: 18px;
    }

    .holiday-submit-panel {
      margin-top: 28px;
      padding: 10px;
      border-radius: 32px;
    }

    .holiday-submit-panel button {
      min-height: 78px;
      border-radius: 25px;
      font-size: 20px;
    }
  }

  @media (max-width: 420px) {
    .holiday-request-navigation {
      grid-template-columns:
        80px 1fr 80px;
    }

    .holiday-request-navigation h1 {
      font-size: 19px;
    }

    .holiday-request-navigation button {
      font-size: 14px;
    }

    .holiday-request-hero h2 {
      font-size: 29px;
    }

    .holiday-allowance-card strong {
      font-size: 30px;
    }

    .holiday-readonly-field,
    .holiday-date-input {
      min-height: 82px;
      font-size: 18px;
    }
  }
`;