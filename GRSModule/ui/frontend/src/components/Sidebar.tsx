import { NavLink } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { useConfigContext } from "../context/ConfigContext";

const STAGES = ["seeds", "render", "perturb", "validate", "infer", "judge"];
const CONFIGS = ["obligations", "mutations", "judge_rubric", "models", "templates", "run_config"];

const linkStyle = (isActive: boolean): CSSProperties => ({
  display: "block",
  padding: "4px 12px",
  textDecoration: "none",
  color: isActive ? "#0066cc" : "#333",
  fontWeight: isActive ? 600 : 400,
  borderRadius: 4,
  backgroundColor: isActive ? "#e8f0fe" : "transparent",
});

export default function Sidebar() {
  const { dirtyConfigs } = useConfigContext();

  return (
    <nav
      style={{
        width: 200,
        flexShrink: 0,
        borderRight: "1px solid #ddd",
        padding: "1rem 0",
        fontSize: 14,
      }}
    >
      <Section title="PIPELINE">
        <NavLink to="/" style={({ isActive }) => linkStyle(isActive)} end>
          Overview
        </NavLink>
        {STAGES.map((s) => (
          <NavLink
            key={s}
            to={`/stage/${s}`}
            style={({ isActive }) => linkStyle(isActive)}
          >
            {s}
          </NavLink>
        ))}
      </Section>

      <Section title="CONFIGS">
        {CONFIGS.map((c) => (
          <NavLink
            key={c}
            to={`/config/${c}`}
            style={({ isActive }) => linkStyle(isActive)}
          >
            {c}
            {dirtyConfigs.has(c) && (
              <span style={{ color: "#e65100", marginLeft: 4 }}>●</span>
            )}
          </NavLink>
        ))}
      </Section>

      <Section title="RESULTS">
        <NavLink
          to="/results/leaderboard"
          style={({ isActive }) => linkStyle(isActive)}
        >
          leaderboard
        </NavLink>
        <NavLink
          to="/results/history"
          style={({ isActive }) => linkStyle(isActive)}
        >
          history
        </NavLink>
      </Section>
    </nav>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div
        style={{
          padding: "4px 12px",
          fontSize: 11,
          fontWeight: 700,
          color: "#888",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
