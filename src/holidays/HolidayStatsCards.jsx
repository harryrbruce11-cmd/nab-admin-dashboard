import React from "react";

export default function HolidayStatsCards({
  allowance,
  used,
  remaining,
  pending,
}) {
  return (
    <div style={gridStyle}>
      <StatCard
        title="Annual Allowance"
        value={`${allowance} Days`}
        colour="#2563eb"
        icon="🏖️"
      />

      <StatCard
        title="Used"
        value={`${used} Days`}
        colour="#dc2626"
        icon="📅"
      />

      <StatCard
        title="Remaining"
        value={`${remaining} Days`}
        colour="#16a34a"
        icon="✅"
      />

      <StatCard
        title="Pending"
        value={`${pending}`}
        colour="#f59e0b"
        icon="⏳"
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  colour,
  icon,
}) {
  return (
    <div style={cardStyle}>

      <div
        style={{
          ...iconCircleStyle,
          background: colour,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1 }}>

        <p style={titleStyle}>
          {title}
        </p>

        <h2 style={valueStyle}>
          {value}
        </h2>

      </div>

    </div>
  );
}

const gridStyle = {

  display: "grid",

  gridTemplateColumns:
    "repeat(auto-fit,minmax(240px,1fr))",

  gap: 18

};

const cardStyle = {

  background: "#ffffff",

  borderRadius: 18,

  padding: 22,

  display: "flex",

  alignItems: "center",

  gap: 18,

  border: "1px solid #e5e7eb",

  boxShadow:
    "0 14px 40px rgba(15,23,42,.06)"

};

const iconCircleStyle = {

  width: 64,

  height: 64,

  borderRadius: 999,

  display: "flex",

  alignItems: "center",

  justifyContent: "center",

  color: "#fff",

  fontSize: 28,

  flexShrink: 0

};

const titleStyle = {

  margin: 0,

  color: "#64748b",

  fontSize: 13,

  fontWeight: 900,

  textTransform: "uppercase",

  letterSpacing: 1

};

const valueStyle = {

  margin: "8px 0 0",

  fontSize: 34,

  color: "#111827",

  fontWeight: 900,

  letterSpacing: -1

};