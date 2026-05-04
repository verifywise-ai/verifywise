import React from "react";
import { BookOpen, HelpCircle, MessageSquare, Sparkles } from "lucide-react";
import { colors, typography } from "./styles/theme";
import "./TabBar.css";

type Tab = "user-guide" | "advisor" | "help" | "whats-new";

interface TabBarProps {
  activeTab: Tab | undefined;
  onTabChange: (tab: Tab) => void;
  displayAdvisor: boolean;
}

interface TabItemProps {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const TabItem: React.FC<TabItemProps> = ({ label, icon, isActive, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`tab-item ${isActive ? "active" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 8px",
        cursor: "pointer",
        borderLeft: isActive ? `2px solid ${colors.brand.primary}` : "2px solid transparent",
        borderBottom: `1px solid ${colors.border.default}`,
        minHeight: 120,
        boxSizing: "border-box",
      }}
    >
      <div
        className="tab-icon"
        style={{
          color: isActive ? colors.brand.primary : colors.text.muted,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <span
        style={{
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          fontFamily: typography.fontFamily.sans,
          fontSize: 12,
          fontWeight: typography.fontWeight.normal,
          color: isActive ? colors.brand.primary : colors.text.muted,
          letterSpacing: "0.5px",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
};

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange, displayAdvisor }) => {
  return (
    <div
      style={{
        width: 40,
        height: "100%",
        backgroundColor: colors.background.alt,
        borderLeft: `1px solid ${colors.border.default}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}
    >
      <TabItem
        id="user-guide"
        label="User guide"
        icon={<BookOpen size={18} strokeWidth={1.5} />}
        isActive={activeTab === "user-guide"}
        onClick={() => onTabChange("user-guide")}
      />
      {displayAdvisor && (
        <TabItem
          id="advisor"
          label="AI advisor"
          icon={<MessageSquare size={18} strokeWidth={1.5} />}
          isActive={activeTab === "advisor"}
          onClick={() => onTabChange("advisor")}
        />
      )}
      <TabItem
        id="whats-new"
        label="What's new"
        icon={<Sparkles size={18} strokeWidth={1.5} />}
        isActive={activeTab === "whats-new"}
        onClick={() => onTabChange("whats-new")}
      />
      <TabItem
        id="help"
        label="Help"
        icon={<HelpCircle size={18} strokeWidth={1.5} />}
        isActive={activeTab === "help"}
        onClick={() => onTabChange("help")}
      />
    </div>
  );
};

export default TabBar;
