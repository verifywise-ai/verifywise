# TabBar Component

A standardized, easy-to-use tab navigation component for VerifyWise.

## Features

✅ **Consistent styling** - All tabs look the same across the app
✅ **Built-in icon support** - Just pass icon name as a string
✅ **Automatic counts & badges** - Shows loading states and counts
✅ **Type-safe** - Full TypeScript support
✅ **Zero boilerplate** - No need to import icons or styles manually

## Basic Usage

```tsx
import TabBar from "../../components/TabBar";

const MyPage = () => {
  const [activeTab, setActiveTab] = useState("profile");

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  return (
    <TabBar
      tabs={[
        { label: "Profile", value: "profile", icon: "User" },
        { label: "Password", value: "password", icon: "Lock" },
        { label: "Team", value: "team", icon: "Users" },
      ]}
      activeTab={activeTab}
      onChange={handleTabChange}
    />
  );
};
```

## Advanced Usage

### With Counts and Loading States

```tsx
<TabBar
  tabs={[
    {
      label: "Vendors",
      value: "vendors",
      icon: "Building",
      count: vendors.length,
      isLoading: isLoadingVendors,
    },
    {
      label: "Risks",
      value: "risks",
      icon: "AlertTriangle",
      count: risks.length,
      isLoading: isLoadingRisks,
    },
  ]}
  activeTab={activeTab}
  onChange={handleTabChange}
/>
```

### With Disabled Tabs

```tsx
<TabBar
  tabs={[
    { label: "Profile", value: "profile", icon: "User" },
    {
      label: "Admin",
      value: "admin",
      icon: "Shield",
      disabled: !isAdmin, // Conditionally disable
    },
  ]}
  activeTab={activeTab}
  onChange={handleTabChange}
/>
```

### With Custom Tab Content

```tsx
<TabBar
  tabs={[
    {
      label: "Overview",
      value: "overview",
      icon: "LayoutDashboard",
      content: <OverviewComponent />,
    },
    {
      label: "Settings",
      value: "settings",
      icon: "Settings",
      content: <SettingsComponent />,
    },
  ]}
  activeTab={activeTab}
  onChange={handleTabChange}
/>
```

### With Page Tour Integration

```tsx
<TabBar
  tabs={[...]}
  activeTab={activeTab}
  onChange={handleTabChange}
  dataJoyrideId="my-page-tabs"
/>
```

## Available Icons

All icons from [Lucide React](https://lucide.dev/icons/) are available. Just pass the icon name as a string:

**Common Icons:**

- `User` - User profile
- `Lock` - Password/security
- `Users` - Team/group
- `Building`, `Building2` - Organization/vendors
- `Settings` - Settings/configuration
- `LayoutDashboard` - Dashboard/overview
- `AlertTriangle` - Risks/warnings
- `FileText` - Documents/resources
- `Key` - API keys/authentication
- `Calendar` - Events/dates
- `Database` - Data storage
- `Box` - Models/containers
- `Link` - Connections/linking

**See all available icons:** https://lucide.dev/icons/

## Props

| Prop             | Type                     | Required | Default     | Description                 |
| ---------------- | ------------------------ | -------- | ----------- | --------------------------- |
| `tabs`           | `TabItem[]`              | ✅ Yes   | -           | Array of tab configurations |
| `activeTab`      | `string`                 | ✅ Yes   | -           | Currently active tab value  |
| `onChange`       | `(event, value) => void` | ✅ Yes   | -           | Handler for tab changes     |
| `tabListSx`      | `object`                 | No       | -           | Custom styles for tab list  |
| `tabSx`          | `object`                 | No       | -           | Custom styles for tabs      |
| `disableRipple`  | `boolean`                | No       | `true`      | Disable ripple effect       |
| `indicatorColor` | `string`                 | No       | `"#13715B"` | Active tab indicator color  |
| `dataJoyrideId`  | `string`                 | No       | -           | ID for page tours           |

### TabItem Interface

```typescript
interface TabItem {
  label: string; // Tab label text
  value: string; // Unique tab identifier
  icon?: string; // Lucide icon name
  count?: number; // Badge count
  isLoading?: boolean; // Show loading state
  disabled?: boolean; // Disable the tab
  content?: ReactNode; // Tab panel content
}
```

## Migration Guide

### Before (Old Approach)

```tsx
import { User, Lock } from "lucide-react";
import { settingTabStyle } from "./style";
import { createTabLabelWithCount } from "../../utils/tabUtils";

<TabContext value={activeTab}>
  <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
    <TabList
      onChange={handleTabChange}
      TabIndicatorProps={{ style: { backgroundColor: "#13715B" } }}
      sx={tabContainerStyle}
    >
      <Tab
        label={createTabLabelWithCount({
          label: "Profile",
          icon: <User size={14} />,
        })}
        value="profile"
        sx={settingTabStyle}
        disableRipple
      />
      <Tab
        label={createTabLabelWithCount({
          label: "Password",
          icon: <Lock size={14} />,
        })}
        value="password"
        sx={settingTabStyle}
        disableRipple
      />
    </TabList>
  </Box>
  <TabPanel value="profile">...</TabPanel>
  <TabPanel value="password">...</TabPanel>
</TabContext>;
```

### After (New Approach)

```tsx
import TabBar from "../../components/TabBar";

<TabBar
  tabs={[
    { label: "Profile", value: "profile", icon: "User", content: <ProfilePage /> },
    { label: "Password", value: "password", icon: "Lock", content: <PasswordPage /> },
  ]}
  activeTab={activeTab}
  onChange={handleTabChange}
/>;
```

**Result:** 80% less code, no manual imports, consistent styling! 🎉

## Tips

1. **Icon names are type-safe** - Your IDE will autocomplete valid icon names
2. **No need to import icons** - Just use the string name
3. **Counts update automatically** - Pass count from your state/query
4. **Styling is consistent** - All tabs across the app will look the same
5. **Override if needed** - Use `tabSx` and `tabListSx` for custom styling

## Questions?

See existing implementations in:

- `/src/presentation/pages/AITrustCenter/index.tsx`
- `/src/presentation/pages/SettingsPage/index.tsx`
- `/src/presentation/pages/Vendors/index.tsx`
