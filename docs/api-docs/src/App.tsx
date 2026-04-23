import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, TextField, InputAdornment, Collapse } from '@mui/material';
import {
  Search,
  Key,
  Users,
  FolderKanban,
  FileText,
  Palette,
  Type,
  Layers,
  MousePointer2,
  Table2,
  LayoutGrid,
  Bell,
  Home,
  Shield,
  Building2,
  AlertTriangle,
  Package,
  ClipboardCheck,
  FileCheck,
  Brain,
  Scale,
  Award,
  Gauge,
  GraduationCap,
  UserCog,
  Settings,
  Boxes,
  Globe,
  Upload,
  Mail,
  LayoutDashboard,
  ListTodo,
  KeyRound,
  SlidersHorizontal,
  Database,
  Siren,
  Stamp,
  Zap,
  Link,
  BarChart3,
  MessageSquare,
  CreditCard,
  Sparkles,
  ScrollText,
  ChevronDown,
  ChevronRight,
  TextCursorInput,
  ToggleLeft,
  Square,
  Navigation,
  Tag,
  BoxSelect,
  Loader,
  MessageCircle,
  UserCircle,
  PanelTop,
  Space,
  Image,
  Play,
  Monitor,
  Layers2,
  ThumbsUp,
  Accessibility,
  FolderTree,
  Code2,
} from 'lucide-react';
import EndpointCard from './components/EndpointCard';
import {
  agentDiscoveryEndpoints,
  aiAdvisorEndpoints,
  aiDetectionEndpoints,
  aiIncidentEndpoints,
  aiTrustCentreEndpoints,
  approvalWorkflowEndpoints,
  assessmentEndpoints,
  auditEndpoints,
  authenticationEndpoints,
  automationEndpoints,
  ceMarkingEndpoints,
  changeHistoryEndpoints,
  complianceEndpoints,
  dashboardEndpoints,
  datasetEndpoints,
  demoDataEndpoints,
  emailEndpoints,
  entityGraphEndpoints,
  euAiActEndpoints,
  evidenceHubEndpoints,
  fileEndpoints,
  frameworkEndpoints,
  friaEndpoints,
  intakeFormEndpoints,
  integrationEndpoints,
  internalEndpoints,
  invitationEndpoints,
  iso27001Endpoints,
  iso42001Endpoints,
  llmKeyEndpoints,
  modelInventoryEndpoints,
  modelRiskEndpoints,
  nistAiRmfEndpoints,
  noteEndpoints,
  notificationEndpoints,
  organizationEndpoints,
  pluginEndpoints,
  policyEndpoints,
  postMarketMonitoringEndpoints,
  projectEndpoints,
  projectRiskEndpoints,
  quantitativeRiskEndpoints,
  reportingEndpoints,
  riskBenchmarkEndpoints,
  riskHistoryEndpoints,
  roleEndpoints,
  searchEndpoints,
  settingEndpoints,
  shadowAiEndpoints,
  shareLinkEndpoints,
  slackWebhookEndpoints,
  subscriptionEndpoints,
  superAdminEndpoints,
  systemEndpoints,
  taskEndpoints,
  tokenEndpoints,
  trainingEndpoints,
  userEndpoints,
  userPreferenceEndpoints,
  vendorEndpoints,
  vendorRiskEndpoints,
  webhookEndpoints,
  Endpoint,
} from './config/endpoints';

// StyleGuide wrapper
import StyleGuideWrapper from './components/StyleGuide/StyleGuideWrapper';

// UserGuide wrapper
import UserGuideWrapper from './components/UserGuide/UserGuideWrapper';

// Types matching StyleGuide pattern
type TopTab = 'user-guide' | 'api-docs' | 'style-guide';

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: string;
  keywords: string[];
};

const App: React.FC = () => {
  const { tab, section, articleId } = useParams<{
    tab?: string;
    section?: string;
    articleId?: string;
  }>();
  // For user-guide: section = collectionId, articleId = articleId
  const navigate = useNavigate();

  // Map URL params to state
  const getTabFromUrl = (): TopTab => {
    if (tab === 'user-guide' || tab === 'api-docs' || tab === 'style-guide') {
      return tab;
    }
    return 'api-docs'; // default
  };

  const [activeTopTab, setActiveTopTab] = useState<TopTab>(getTabFromUrl());
  const [activeSection, setActiveSection] = useState(section || 'overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'getting-started': true,
    'core-resources': true,
  });

  // Sync state with URL params
  useEffect(() => {
    const urlTab = getTabFromUrl();
    if (urlTab !== activeTopTab) {
      setActiveTopTab(urlTab);
    }
    if (section && section !== activeSection) {
      setActiveSection(section);
    } else if (!section && activeSection !== 'overview') {
      setActiveSection('overview');
    }
  }, [tab, section]);

  // API Documentation nav items - Full list
  const apiNavItems: NavItem[] = [
    // Getting Started
    { id: 'overview', label: 'Overview', icon: <Home size={14} />, category: 'getting-started', keywords: ['overview', 'introduction', 'start'] },
    { id: 'authentication', label: 'Authentication', icon: <Key size={14} />, category: 'getting-started', keywords: ['auth', 'login', 'token', 'jwt'] },

    // Core Resources
    { id: 'users', label: 'Users', icon: <Users size={14} />, category: 'core-resources', keywords: ['user', 'account', 'profile'] },
    { id: 'organizations', label: 'Organizations', icon: <Building2 size={14} />, category: 'core-resources', keywords: ['org', 'organization', 'tenant'] },
    { id: 'projects', label: 'Projects', icon: <FolderKanban size={14} />, category: 'core-resources', keywords: ['project', 'compliance'] },
    { id: 'roles', label: 'Roles', icon: <UserCog size={14} />, category: 'core-resources', keywords: ['role', 'permission', 'access'] },
    { id: 'invitations', label: 'Invitations', icon: <Mail size={14} />, category: 'core-resources', keywords: ['invite', 'invitation', 'onboard'] },
    { id: 'super-admin', label: 'Super admin', icon: <Shield size={14} />, category: 'core-resources', keywords: ['super', 'admin', 'system'] },

    // Risk Management
    { id: 'project-risks', label: 'Project risks', icon: <AlertTriangle size={14} />, category: 'risk-management', keywords: ['risk', 'threat', 'vulnerability', 'project'] },
    { id: 'vendors', label: 'Vendors', icon: <Package size={14} />, category: 'risk-management', keywords: ['vendor', 'supplier', 'third-party'] },
    { id: 'vendor-risks', label: 'Vendor risks', icon: <AlertTriangle size={14} />, category: 'risk-management', keywords: ['vendor', 'risk', 'supplier'] },
    { id: 'quantitative-risks', label: 'Quantitative risks', icon: <Gauge size={14} />, category: 'risk-management', keywords: ['quantitative', 'risk', 'benchmark'] },
    { id: 'risk-benchmarks', label: 'Risk benchmarks', icon: <BarChart3 size={14} />, category: 'risk-management', keywords: ['benchmark', 'risk', 'compare'] },
    { id: 'risk-history', label: 'Risk history', icon: <ScrollText size={14} />, category: 'risk-management', keywords: ['risk', 'history', 'timeline'] },

    // AI Governance
    { id: 'model-inventory', label: 'Model inventory', icon: <Brain size={14} />, category: 'ai-governance', keywords: ['model', 'inventory', 'ai', 'llm'] },
    { id: 'model-risks', label: 'Model risks', icon: <Gauge size={14} />, category: 'ai-governance', keywords: ['model', 'risk', 'ai'] },
    { id: 'datasets', label: 'Datasets', icon: <Database size={14} />, category: 'ai-governance', keywords: ['dataset', 'data', 'training'] },
    { id: 'training', label: 'Training', icon: <GraduationCap size={14} />, category: 'ai-governance', keywords: ['training', 'education', 'learning'] },
    { id: 'ai-trust-centre', label: 'AI Trust Centre', icon: <Globe size={14} />, category: 'ai-governance', keywords: ['trust', 'centre', 'center', 'ai'] },
    { id: 'ai-detection', label: 'AI detection', icon: <Search size={14} />, category: 'ai-governance', keywords: ['detection', 'scan', 'ai', 'repository'] },
    { id: 'ai-advisor', label: 'AI advisor', icon: <Sparkles size={14} />, category: 'ai-governance', keywords: ['advisor', 'ai', 'chat', 'guidance'] },
    { id: 'agent-discovery', label: 'Agent discovery', icon: <Brain size={14} />, category: 'ai-governance', keywords: ['agent', 'primitive', 'discovery'] },
    { id: 'shadow-ai', label: 'Shadow AI', icon: <AlertTriangle size={14} />, category: 'ai-governance', keywords: ['shadow', 'ai', 'unauthorized'] },

    // Compliance Frameworks
    { id: 'assessments', label: 'Assessments', icon: <ClipboardCheck size={14} />, category: 'compliance', keywords: ['assessment', 'evaluate'] },
    { id: 'policies', label: 'Policies', icon: <FileCheck size={14} />, category: 'compliance', keywords: ['policy', 'governance'] },
    { id: 'frameworks', label: 'Frameworks', icon: <Layers size={14} />, category: 'compliance', keywords: ['framework', 'standard'] },
    { id: 'eu-ai-act', label: 'EU AI Act', icon: <Shield size={14} />, category: 'compliance', keywords: ['eu', 'ai act', 'regulation'] },
    { id: 'iso-27001', label: 'ISO 27001', icon: <Award size={14} />, category: 'compliance', keywords: ['iso', '27001', 'security'] },
    { id: 'iso-42001', label: 'ISO 42001', icon: <Award size={14} />, category: 'compliance', keywords: ['iso', '42001', 'ai'] },
    { id: 'nist-ai-rmf', label: 'NIST AI RMF', icon: <Award size={14} />, category: 'compliance', keywords: ['nist', 'rmf', 'framework'] },
    { id: 'fria', label: 'FRIA', icon: <Scale size={14} />, category: 'compliance', keywords: ['fria', 'fundamental', 'rights', 'impact'] },
    { id: 'compliance-score', label: 'Compliance score', icon: <Gauge size={14} />, category: 'compliance', keywords: ['compliance', 'score', 'progress'] },
    { id: 'approval-workflows', label: 'Approval workflows', icon: <ClipboardCheck size={14} />, category: 'compliance', keywords: ['approval', 'workflow', 'review'] },

    // Utilities
    { id: 'files', label: 'Files', icon: <Upload size={14} />, category: 'utilities', keywords: ['file', 'upload', 'document'] },
    { id: 'email', label: 'Email services', icon: <Mail size={14} />, category: 'utilities', keywords: ['email', 'mail', 'invite'] },
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} />, category: 'utilities', keywords: ['dashboard', 'stats', 'metrics'] },
    { id: 'search', label: 'Search', icon: <Search size={14} />, category: 'utilities', keywords: ['search', 'find', 'query'] },
    { id: 'system', label: 'System & logs', icon: <ScrollText size={14} />, category: 'utilities', keywords: ['log', 'audit', 'history', 'system', 'version', 'health'] },
    { id: 'tasks', label: 'Tasks', icon: <ListTodo size={14} />, category: 'utilities', keywords: ['task', 'todo', 'item'] },
    { id: 'tokens', label: 'Tokens', icon: <KeyRound size={14} />, category: 'utilities', keywords: ['token', 'api key', 'access'] },
    { id: 'user-preferences', label: 'User preferences', icon: <SlidersHorizontal size={14} />, category: 'utilities', keywords: ['preference', 'settings', 'config'] },
    { id: 'notes', label: 'Notes', icon: <FileText size={14} />, category: 'utilities', keywords: ['note', 'comment', 'annotation'] },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={14} />, category: 'utilities', keywords: ['notification', 'alert', 'bell'] },
    { id: 'share-links', label: 'Share links', icon: <Link size={14} />, category: 'utilities', keywords: ['share', 'link', 'public'] },
    { id: 'reporting', label: 'Reporting', icon: <BarChart3 size={14} />, category: 'utilities', keywords: ['report', 'analytics', 'export'] },
    { id: 'slack-webhooks', label: 'Slack webhooks', icon: <MessageSquare size={14} />, category: 'utilities', keywords: ['slack', 'webhook', 'notification'] },
    { id: 'settings', label: 'Settings', icon: <Settings size={14} />, category: 'utilities', keywords: ['settings', 'configuration', 'config'] },
    { id: 'subscription', label: 'Subscription', icon: <CreditCard size={14} />, category: 'utilities', keywords: ['subscription', 'billing', 'plan'] },

    // Advanced
    { id: 'evidence-hub', label: 'Evidence hub', icon: <Database size={14} />, category: 'advanced', keywords: ['evidence', 'document', 'proof'] },
    { id: 'ai-incidents', label: 'AI incidents', icon: <Siren size={14} />, category: 'advanced', keywords: ['incident', 'ai', 'issue'] },
    { id: 'ce-marking', label: 'CE marking', icon: <Stamp size={14} />, category: 'advanced', keywords: ['ce', 'marking', 'certification'] },
    { id: 'automation', label: 'Automation', icon: <Zap size={14} />, category: 'advanced', keywords: ['automation', 'rule', 'workflow'] },
    { id: 'integrations', label: 'Integrations', icon: <Globe size={14} />, category: 'advanced', keywords: ['integration', 'connect', 'api'] },
    { id: 'intake-forms', label: 'Intake forms', icon: <ClipboardCheck size={14} />, category: 'advanced', keywords: ['intake', 'form', 'submission'] },
    { id: 'entity-graph', label: 'Entity graph', icon: <Layers size={14} />, category: 'advanced', keywords: ['entity', 'graph', 'relationship'] },
    { id: 'post-market-monitoring', label: 'Post-market monitoring', icon: <Gauge size={14} />, category: 'advanced', keywords: ['post-market', 'monitoring', 'pmm'] },
    { id: 'plugins', label: 'Plugins', icon: <Boxes size={14} />, category: 'advanced', keywords: ['plugin', 'marketplace', 'extension'] },
    { id: 'change-history', label: 'Change history', icon: <ScrollText size={14} />, category: 'advanced', keywords: ['change', 'history', 'audit'] },
    { id: 'audit-ledger', label: 'Audit ledger', icon: <FileCheck size={14} />, category: 'advanced', keywords: ['audit', 'ledger', 'verify'] },
    { id: 'webhooks', label: 'Webhooks', icon: <Zap size={14} />, category: 'advanced', keywords: ['webhook', 'callback', 'event'] },
    { id: 'demo-data', label: 'Demo data', icon: <Database size={14} />, category: 'advanced', keywords: ['demo', 'seed', 'sample', 'data'] },
    { id: 'internal', label: 'Internal', icon: <Code2 size={14} />, category: 'advanced', keywords: ['internal', 'debug', 'system'] },
    { id: 'llm-keys', label: 'LLM keys', icon: <KeyRound size={14} />, category: 'advanced', keywords: ['llm', 'key', 'api', 'provider'] },
  ];

  // Style Guide nav items - full list
  const styleGuideNavItems: NavItem[] = [
    // Components
    { id: 'form-inputs', label: 'Form inputs', icon: <TextCursorInput size={14} />, category: 'sg-components', keywords: ['input', 'text', 'select', 'dropdown', 'field', 'form', 'search'] },
    { id: 'buttons', label: 'Buttons', icon: <MousePointer2 size={14} />, category: 'sg-components', keywords: ['button', 'click', 'action', 'submit', 'primary', 'secondary'] },
    { id: 'tables', label: 'Tables', icon: <Table2 size={14} />, category: 'sg-components', keywords: ['table', 'data', 'grid', 'list', 'row', 'column', 'cell'] },
    { id: 'cards', label: 'Cards & containers', icon: <LayoutGrid size={14} />, category: 'sg-components', keywords: ['card', 'container', 'box', 'panel', 'wrapper'] },
    { id: 'modals', label: 'Modals & drawers', icon: <Layers size={14} />, category: 'sg-components', keywords: ['modal', 'dialog', 'drawer', 'popup', 'overlay', 'sheet'] },
    { id: 'toggles', label: 'Toggles & checkboxes', icon: <ToggleLeft size={14} />, category: 'sg-components', keywords: ['toggle', 'switch', 'checkbox', 'radio', 'check'] },
    { id: 'status', label: 'Status indicators', icon: <Square size={14} />, category: 'sg-components', keywords: ['status', 'badge', 'indicator', 'state', 'progress'] },
    { id: 'alerts', label: 'Alerts & toasts', icon: <Bell size={14} />, category: 'sg-components', keywords: ['alert', 'toast', 'notification', 'message', 'snackbar', 'error', 'success', 'warning'] },
    { id: 'breadcrumbs', label: 'Breadcrumbs', icon: <Navigation size={14} />, category: 'sg-components', keywords: ['breadcrumb', 'navigation', 'path', 'trail'] },
    { id: 'pagination', label: 'Pagination', icon: <ChevronRight size={14} />, category: 'sg-components', keywords: ['pagination', 'page', 'next', 'previous', 'table'] },
    { id: 'tags', label: 'Tags & chips', icon: <Tag size={14} />, category: 'sg-components', keywords: ['tag', 'chip', 'label', 'badge', 'policy'] },
    { id: 'empty-states', label: 'Empty states', icon: <BoxSelect size={14} />, category: 'sg-components', keywords: ['empty', 'no data', 'placeholder', 'skeleton'] },
    { id: 'loading-states', label: 'Loading states', icon: <Loader size={14} />, category: 'sg-components', keywords: ['loading', 'spinner', 'skeleton', 'progress', 'loader'] },
    { id: 'tooltips', label: 'Tooltips', icon: <MessageCircle size={14} />, category: 'sg-components', keywords: ['tooltip', 'hint', 'hover', 'popover', 'info'] },
    { id: 'avatars', label: 'Avatars', icon: <UserCircle size={14} />, category: 'sg-components', keywords: ['avatar', 'user', 'profile', 'image', 'initials'] },
    { id: 'tabs', label: 'Tabs', icon: <PanelTop size={14} />, category: 'sg-components', keywords: ['tab', 'tabbar', 'navigation', 'panel'] },
    // Foundations
    { id: 'colors', label: 'Colors', icon: <Palette size={14} />, category: 'sg-foundations', keywords: ['color', 'palette', 'theme', 'primary', 'secondary', 'status'] },
    { id: 'typography', label: 'Typography', icon: <Type size={14} />, category: 'sg-foundations', keywords: ['font', 'text', 'typography', 'heading', 'size', 'weight'] },
    { id: 'spacing', label: 'Spacing & layout', icon: <Space size={14} />, category: 'sg-foundations', keywords: ['spacing', 'padding', 'margin', 'gap', 'layout', 'flex', 'grid'] },
    { id: 'icons', label: 'Icons', icon: <Image size={14} />, category: 'sg-foundations', keywords: ['icon', 'lucide', 'svg', 'symbol'] },
    { id: 'shadows', label: 'Shadows & elevation', icon: <Sparkles size={14} />, category: 'sg-foundations', keywords: ['shadow', 'elevation', 'depth', 'box-shadow', 'border'] },
    { id: 'animations', label: 'Animations', icon: <Play size={14} />, category: 'sg-foundations', keywords: ['animation', 'transition', 'motion', 'keyframe', 'ease'] },
    { id: 'breakpoints', label: 'Breakpoints', icon: <Monitor size={14} />, category: 'sg-foundations', keywords: ['breakpoint', 'responsive', 'mobile', 'tablet', 'desktop', 'media query'] },
    { id: 'z-index', label: 'Z-Index', icon: <Layers2 size={14} />, category: 'sg-foundations', keywords: ['z-index', 'layer', 'stack', 'overlay', 'modal'] },
    // Resources
    { id: 'dos-and-donts', label: "Do's and don'ts", icon: <ThumbsUp size={14} />, category: 'sg-resources', keywords: ['do', 'dont', 'best practice', 'guideline', 'rule'] },
    { id: 'accessibility', label: 'Accessibility', icon: <Accessibility size={14} />, category: 'sg-resources', keywords: ['accessibility', 'a11y', 'wcag', 'aria', 'screen reader', 'keyboard'] },
    { id: 'file-structure', label: 'File structure', icon: <FolderTree size={14} />, category: 'sg-resources', keywords: ['file', 'folder', 'structure', 'organization', 'architecture'] },
    { id: 'common-patterns', label: 'Common patterns', icon: <Code2 size={14} />, category: 'sg-resources', keywords: ['pattern', 'recipe', 'example', 'template', 'code'] },
    { id: 'documentation-guidelines', label: 'Documentation guidelines', icon: <FileText size={14} />, category: 'sg-resources', keywords: ['documentation', 'writing', 'guide', 'style', 'content'] },
  ];

  // User Guide has its own layout, no sidebar nav items needed
  const userGuideNavItems: NavItem[] = [];

  const getCurrentNavItems = () => {
    switch (activeTopTab) {
      case 'user-guide': return userGuideNavItems;
      case 'api-docs': return apiNavItems;
      case 'style-guide': return styleGuideNavItems;
      default: return apiNavItems;
    }
  };

  const navItems = getCurrentNavItems();

  // Group items by category
  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  // Filter by search
  const filterItems = (items: NavItem[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      item =>
        item.label.toLowerCase().includes(query) ||
        item.keywords.some(kw => kw.toLowerCase().includes(query))
    );
  };

  const handleTopTabClick = (newTab: TopTab) => {
    // User Guide has its own landing page, navigate directly
    if (newTab === 'user-guide') {
      navigate(`/resources/user-guide`);
      setActiveTopTab(newTab);
      return;
    }

    // Get first section of new tab
    const items = newTab === 'api-docs' ? apiNavItems : styleGuideNavItems;
    const firstSection = items[0]?.id || 'overview';

    // Navigate to new URL
    navigate(`/resources/${newTab}/${firstSection}`);
    setActiveTopTab(newTab);
    setActiveSection(firstSection);
  };

  const handleSectionClick = (sectionId: string) => {
    navigate(`/resources/${activeTopTab}/${sectionId}`);
    setActiveSection(sectionId);
  };

  const renderNavItem = (item: NavItem) => (
    <Box
      key={item.id}
      onClick={() => handleSectionClick(item.id)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        p: '5px 10px',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: activeSection === item.id ? '#F4F4F4' : 'transparent',
        color: activeSection === item.id ? '#13715B' : '#344054',
        fontWeight: activeSection === item.id ? 500 : 400,
        transition: 'background-color 150ms ease',
        '&:hover': {
          backgroundColor: '#F4F4F4',
        },
        '& svg': {
          width: 14,
          height: 14,
        },
      }}
    >
      {item.icon}
      <Typography sx={{ fontSize: 12, fontWeight: 'inherit', color: 'inherit' }}>
        {item.label}
      </Typography>
    </Box>
  );

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'getting-started': 'Getting started',
      'core-resources': 'Core resources',
      'risk-management': 'Risk management',
      'ai-governance': 'AI governance',
      'compliance': 'Compliance',
      'utilities': 'Utilities',
      'advanced': 'Advanced',
      'foundations': 'Foundations',
      'components': 'Components',
      'basics': 'Basics',
      'sg-components': 'Components',
      'sg-foundations': 'Foundations',
      'sg-resources': 'Resources',
      'guides': 'Guides',
    };
    return labels[category] || category;
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Auto-expand category when active section changes
  useEffect(() => {
    const currentItem = navItems.find(item => item.id === activeSection);
    if (currentItem && !expandedCategories[currentItem.category]) {
      setExpandedCategories(prev => ({
        ...prev,
        [currentItem.category]: true,
      }));
    }
  }, [activeSection]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Tab Bar - Matching StyleGuide exactly */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: '20px',
          borderBottom: '1px solid #eaecf0',
          backgroundColor: '#fff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[
            { id: 'user-guide' as TopTab, label: 'User guide' },
            { id: 'api-docs' as TopTab, label: 'API documentation' },
            { id: 'style-guide' as TopTab, label: 'Style guide' },
          ].map((tab) => (
            <Box
              key={tab.id}
              onClick={() => handleTopTabClick(tab.id)}
              sx={{
                px: '16px',
                py: '12px',
                cursor: 'pointer',
                borderBottom: activeTopTab === tab.id ? '2px solid #13715B' : '2px solid transparent',
                color: activeTopTab === tab.id ? '#13715B' : '#344054',
                fontWeight: activeTopTab === tab.id ? 500 : 400,
                transition: 'all 150ms ease',
                '&:hover': {
                  color: '#13715B',
                },
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 'inherit', color: 'inherit' }}>
                {tab.label}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <TextField
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{
              width: 200,
              '& .MuiOutlinedInput-root': {
                borderRadius: '4px',
                fontSize: 12,
                backgroundColor: '#fff',
                '& fieldset': { borderColor: '#d0d5dd' },
                '&:hover fieldset': { borderColor: '#13715B' },
                '&.Mui-focused fieldset': { borderColor: '#13715B' },
              },
              '& .MuiOutlinedInput-input': { py: '6px' },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={12} color="#475467" />
                </InputAdornment>
              ),
            }}
          />
          <Box
            sx={{
              px: '8px',
              py: '2px',
              borderRadius: '4px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: '#15803d' }}>
              v2.0.0
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* User Guide takes full width, no sidebar */}
        {activeTopTab === 'user-guide' ? (
          <Box sx={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff' }}>
            <UserGuideWrapper
              collectionId={section}
              articleId={articleId}
              onNavigate={(path) => navigate(path)}
            />
          </Box>
        ) : (
          <>
            {/* Sidebar Navigation - Matching StyleGuide exactly */}
            <Box
              sx={{
                width: 220,
                minWidth: 220,
                borderRight: '1px solid #eaecf0',
                backgroundColor: '#FCFCFD',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ px: '8px', py: '8px', flex: 1, overflowY: 'auto' }}>
                {Object.entries(groupedItems).map(([category, items], index) => {
                  const filteredItems = filterItems(items);
                  if (filteredItems.length === 0) return null;
                  const isExpanded = expandedCategories[category] || searchQuery.trim() !== '';
                  const hasActiveItem = filteredItems.some(item => item.id === activeSection);

                  return (
                    <Box key={category} sx={{ mb: '4px' }}>
                      <Box
                        onClick={() => toggleCategory(category)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          px: '8px',
                          py: '6px',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          mt: index === 0 ? '2px' : '4px',
                          backgroundColor: hasActiveItem && !isExpanded ? '#f0fdf4' : 'transparent',
                          transition: 'background-color 150ms ease',
                          '&:hover': {
                            backgroundColor: '#f4f4f4',
                          },
                        }}
                      >
                        <Box sx={{ color: '#667085', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </Box>
                        <Typography
                          sx={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: hasActiveItem ? '#13715B' : '#475467',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            flex: 1,
                          }}
                        >
                          {getCategoryLabel(category)}
                        </Typography>
                        <Box
                          sx={{
                            px: '5px',
                            py: '1px',
                            borderRadius: '8px',
                            backgroundColor: hasActiveItem ? '#dcfce7' : '#f3f4f6',
                            minWidth: 18,
                            textAlign: 'center',
                          }}
                        >
                          <Typography sx={{ fontSize: 9, fontWeight: 500, color: hasActiveItem ? '#15803d' : '#6b7280' }}>
                            {filteredItems.length}
                          </Typography>
                        </Box>
                      </Box>
                      <Collapse in={isExpanded}>
                        <Box sx={{ pl: '8px' }}>
                          {filteredItems.map(renderNavItem)}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}

                {/* No results */}
                {Object.values(groupedItems).every(items => filterItems(items).length === 0) && (
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: '#475467',
                      textAlign: 'center',
                      py: '24px',
                    }}
                  >
                    No sections found
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Main Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff' }}>
              {activeTopTab === 'api-docs' && (
            <>
              {activeSection === 'overview' && <OverviewSection />}
              {activeSection === 'authentication' && <EndpointSection title="Authentication" description="Endpoints for user registration, login, and token management." endpoints={authenticationEndpoints} />}
              {activeSection === 'users' && <EndpointSection title="Users" description="Endpoints for managing user accounts and profiles." endpoints={userEndpoints} />}
              {activeSection === 'organizations' && <EndpointSection title="Organizations" description="Endpoints for managing organizations (multi-tenancy support)." endpoints={organizationEndpoints} />}
              {activeSection === 'projects' && <EndpointSection title="Projects" description="Endpoints for managing compliance projects." endpoints={projectEndpoints} />}
              {activeSection === 'roles' && <EndpointSection title="Roles" description="Endpoints for managing user roles and permissions." endpoints={roleEndpoints} />}
              {activeSection === 'invitations' && <EndpointSection title="Invitations" description="Endpoints for managing user invitations." endpoints={invitationEndpoints} />}
              {activeSection === 'super-admin' && <EndpointSection title="Super admin" description="Endpoints for super admin operations across all organizations." endpoints={superAdminEndpoints} />}
              {activeSection === 'project-risks' && <EndpointSection title="Project risks" description="Endpoints for managing project-level risks." endpoints={projectRiskEndpoints} />}
              {activeSection === 'vendors' && <EndpointSection title="Vendors" description="Endpoints for managing third-party vendors and suppliers." endpoints={vendorEndpoints} />}
              {activeSection === 'vendor-risks' && <EndpointSection title="Vendor risks" description="Endpoints for managing vendor-related risks." endpoints={vendorRiskEndpoints} />}
              {activeSection === 'quantitative-risks' && <EndpointSection title="Quantitative risks" description="Endpoints for quantitative risk assessment and portfolio analysis." endpoints={quantitativeRiskEndpoints} />}
              {activeSection === 'risk-benchmarks' && <EndpointSection title="Risk benchmarks" description="Endpoints for risk benchmark data and comparisons." endpoints={riskBenchmarkEndpoints} />}
              {activeSection === 'risk-history' && <EndpointSection title="Risk history" description="Endpoints for viewing risk change history and timelines." endpoints={riskHistoryEndpoints} />}
              {activeSection === 'model-inventory' && <EndpointSection title="Model inventory" description="Endpoints for managing AI/ML model inventory." endpoints={modelInventoryEndpoints} />}
              {activeSection === 'model-risks' && <EndpointSection title="Model risks" description="Endpoints for managing AI model risks." endpoints={modelRiskEndpoints} />}
              {activeSection === 'datasets' && <EndpointSection title="Datasets" description="Endpoints for managing datasets associated with AI models." endpoints={datasetEndpoints} />}
              {activeSection === 'training' && <EndpointSection title="Training" description="Endpoints for managing AI training records." endpoints={trainingEndpoints} />}
              {activeSection === 'ai-trust-centre' && <EndpointSection title="AI Trust Centre" description="Endpoints for managing the AI Trust Centre public-facing portal." endpoints={aiTrustCentreEndpoints} />}
              {activeSection === 'ai-detection' && <EndpointSection title="AI detection" description="Endpoints for AI detection scanning, findings, and repository management." endpoints={aiDetectionEndpoints} />}
              {activeSection === 'ai-advisor' && <EndpointSection title="AI advisor" description="Endpoints for the AI governance advisor and chat interface." endpoints={aiAdvisorEndpoints} />}
              {activeSection === 'agent-discovery' && <EndpointSection title="Agent discovery" description="Endpoints for discovering and managing AI agent primitives." endpoints={agentDiscoveryEndpoints} />}
              {activeSection === 'shadow-ai' && <EndpointSection title="Shadow AI" description="Endpoints for shadow AI detection, monitoring, and governance." endpoints={shadowAiEndpoints} />}
              {activeSection === 'assessments' && <EndpointSection title="Assessments" description="Endpoints for managing compliance assessments." endpoints={assessmentEndpoints} />}
              {activeSection === 'policies' && <EndpointSection title="Policies" description="Endpoints for managing organizational policies." endpoints={policyEndpoints} />}
              {activeSection === 'frameworks' && <EndpointSection title="Frameworks" description="Endpoints for managing compliance frameworks." endpoints={frameworkEndpoints} />}
              {activeSection === 'eu-ai-act' && <EndpointSection title="EU AI Act" description="Endpoints for EU AI Act compliance management." endpoints={euAiActEndpoints} />}
              {activeSection === 'iso-27001' && <EndpointSection title="ISO 27001" description="Endpoints for ISO 27001 information security compliance." endpoints={iso27001Endpoints} />}
              {activeSection === 'iso-42001' && <EndpointSection title="ISO 42001" description="Endpoints for ISO 42001 AI management system compliance." endpoints={iso42001Endpoints} />}
              {activeSection === 'nist-ai-rmf' && <EndpointSection title="NIST AI RMF" description="Endpoints for NIST AI Risk Management Framework compliance." endpoints={nistAiRmfEndpoints} />}
              {activeSection === 'fria' && <EndpointSection title="FRIA" description="Endpoints for Fundamental Rights Impact Assessment management." endpoints={friaEndpoints} />}
              {activeSection === 'compliance-score' && <EndpointSection title="Compliance score" description="Endpoints for organization compliance scoring and details." endpoints={complianceEndpoints} />}
              {activeSection === 'approval-workflows' && <EndpointSection title="Approval workflows" description="Endpoints for managing approval workflows and requests." endpoints={approvalWorkflowEndpoints} />}
              {activeSection === 'files' && <EndpointSection title="Files" description="Endpoints for file upload and management." endpoints={fileEndpoints} />}
              {activeSection === 'email' && <EndpointSection title="Email services" description="Endpoints for email-related operations." endpoints={emailEndpoints} />}
              {activeSection === 'dashboard' && <EndpointSection title="Dashboard" description="Endpoints for retrieving dashboard metrics and statistics." endpoints={dashboardEndpoints} />}
              {activeSection === 'search' && <EndpointSection title="Search" description="Endpoints for global search functionality across the platform." endpoints={searchEndpoints} />}
              {activeSection === 'system' && <EndpointSection title="System & logs" description="Endpoints for system health, version info, and activity logs." endpoints={systemEndpoints} />}
              {activeSection === 'tasks' && <EndpointSection title="Tasks" description="Endpoints for managing tasks and to-do items." endpoints={taskEndpoints} />}
              {activeSection === 'tokens' && <EndpointSection title="Tokens" description="Endpoints for API token management." endpoints={tokenEndpoints} />}
              {activeSection === 'user-preferences' && <EndpointSection title="User preferences" description="Endpoints for managing user preferences and settings." endpoints={userPreferenceEndpoints} />}
              {activeSection === 'notes' && <EndpointSection title="Notes" description="Endpoints for creating and managing notes." endpoints={noteEndpoints} />}
              {activeSection === 'notifications' && <EndpointSection title="Notifications" description="Endpoints for notification management and real-time streaming." endpoints={notificationEndpoints} />}
              {activeSection === 'share-links' && <EndpointSection title="Share links" description="Endpoints for creating and managing shareable links." endpoints={shareLinkEndpoints} />}
              {activeSection === 'reporting' && <EndpointSection title="Reporting" description="Endpoints for generating reports and analytics." endpoints={reportingEndpoints} />}
              {activeSection === 'settings' && <EndpointSection title="Settings" description="Endpoints for managing application settings and configuration." endpoints={settingEndpoints} />}
              {activeSection === 'slack-webhooks' && <EndpointSection title="Slack webhooks" description="Endpoints for managing Slack webhook integrations." endpoints={slackWebhookEndpoints} />}
              {activeSection === 'subscription' && <EndpointSection title="Subscription" description="Endpoints for managing subscriptions and billing." endpoints={subscriptionEndpoints} />}
              {activeSection === 'evidence-hub' && <EndpointSection title="Evidence hub" description="Endpoints for the evidence management hub and document repository." endpoints={evidenceHubEndpoints} />}
              {activeSection === 'ai-incidents' && <EndpointSection title="AI incidents" description="Endpoints for managing AI-related incidents and issues." endpoints={aiIncidentEndpoints} />}
              {activeSection === 'ce-marking' && <EndpointSection title="CE marking" description="Endpoints for CE marking compliance and certification." endpoints={ceMarkingEndpoints} />}
              {activeSection === 'automation' && <EndpointSection title="Automation" description="Endpoints for automation rules and workflow management." endpoints={automationEndpoints} />}
              {activeSection === 'integrations' && <EndpointSection title="Integrations" description="Endpoints for managing third-party integrations." endpoints={integrationEndpoints} />}
              {activeSection === 'intake-forms' && <EndpointSection title="Intake forms" description="Endpoints for intake form creation, public submissions, and review." endpoints={intakeFormEndpoints} />}
              {activeSection === 'entity-graph' && <EndpointSection title="Entity graph" description="Endpoints for entity relationship graph, annotations, and gap rules." endpoints={entityGraphEndpoints} />}
              {activeSection === 'post-market-monitoring' && <EndpointSection title="Post-market monitoring" description="Endpoints for post-market monitoring configuration and cycles." endpoints={postMarketMonitoringEndpoints} />}
              {activeSection === 'plugins' && <EndpointSection title="Plugins" description="Endpoints for plugin marketplace and installation management." endpoints={pluginEndpoints} />}
              {activeSection === 'change-history' && <EndpointSection title="Change history" description="Endpoints for tracking entity change history across all domains." endpoints={changeHistoryEndpoints} />}
              {activeSection === 'audit-ledger' && <EndpointSection title="Audit ledger" description="Endpoints for the tamper-proof audit ledger." endpoints={auditEndpoints} />}
              {activeSection === 'webhooks' && <EndpointSection title="Webhooks" description="Endpoints for managing webhook configurations and deliveries." endpoints={webhookEndpoints} />}
              {activeSection === 'demo-data' && <EndpointSection title="Demo data" description="Endpoints for managing demo and seed data." endpoints={demoDataEndpoints} />}
              {activeSection === 'internal' && <EndpointSection title="Internal" description="Internal system endpoints for debugging and diagnostics." endpoints={internalEndpoints} />}
              {activeSection === 'llm-keys' && <EndpointSection title="LLM keys" description="Endpoints for managing LLM provider API keys." endpoints={llmKeyEndpoints} />}
              </>
              )}
              {activeTopTab === 'style-guide' && <StyleGuideWrapper section={activeSection} />}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

// Generic Endpoint Section Component
const EndpointSection: React.FC<{
  title: string;
  description: string;
  endpoints: Endpoint[];
}> = ({ title, description, endpoints }) => (
  <Box sx={{ p: '32px 40px', maxWidth: 900 }}>
    <Typography sx={{ fontSize: 24, fontWeight: 600, color: '#1c2130', mb: '8px' }}>
      {title}
    </Typography>
    <Typography sx={{ fontSize: 14, color: '#475467', mb: '32px' }}>
      {description}
    </Typography>

    {/* Endpoint count badge */}
    <Box sx={{ mb: '20px' }}>
      <Box
        component="span"
        sx={{
          px: '8px',
          py: '3px',
          borderRadius: '12px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          fontSize: 11,
          fontWeight: 500,
          color: '#15803d',
        }}
      >
        {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
      </Box>
    </Box>

    {endpoints.map((endpoint, index) => (
      <EndpointCard
        key={`${endpoint.method}-${endpoint.path}-${index}`}
        method={endpoint.method}
        path={endpoint.path}
        summary={endpoint.summary}
        description={endpoint.description}
        requiresAuth={endpoint.requiresAuth}
        parameters={endpoint.parameters}
        requestBody={endpoint.requestBody}
        responses={endpoint.responses}
      />
    ))}
  </Box>
);

// API Documentation Overview Section
const OverviewSection: React.FC = () => (
  <Box sx={{ p: '32px 40px', maxWidth: 900 }}>
    <Typography sx={{ fontSize: 24, fontWeight: 600, color: '#1c2130', mb: '8px' }}>
      VerifyWise API
    </Typography>
    <Typography sx={{ fontSize: 14, color: '#475467', mb: '32px', lineHeight: 1.6 }}>
      The VerifyWise API enables programmatic access to AI compliance management features
      including project management, risk assessments, vendor management, and compliance
      framework implementations (EU AI Act, ISO 42001, ISO 27001).
    </Typography>

    {/* Base URL */}
    <Box sx={{ mb: '32px' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1c2130', mb: '12px' }}>
        Base URL
      </Typography>
      <Box
        sx={{
          p: '12px 16px',
          backgroundColor: '#1e1e1e',
          borderRadius: '4px',
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          color: '#e5e5e5',
        }}
      >
        http://localhost:3000/api
      </Box>
    </Box>

    {/* Response Format */}
    <Box sx={{ mb: '32px' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1c2130', mb: '12px' }}>
        Response format
      </Typography>
      <Typography sx={{ fontSize: 13, color: '#475467', mb: '12px' }}>
        All responses follow a consistent structure:
      </Typography>
      <Box
        sx={{
          p: '16px',
          backgroundColor: '#1e1e1e',
          borderRadius: '4px',
          fontFamily: "'Fira Code', monospace",
          fontSize: 12,
          color: '#e5e5e5',
          whiteSpace: 'pre',
        }}
      >
{`{
  "message": "ok",
  "data": { ... }
}`}
      </Box>
    </Box>

    {/* Authentication */}
    <Box sx={{ mb: '32px' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1c2130', mb: '12px' }}>
        Authentication
      </Typography>
      <Typography sx={{ fontSize: 13, color: '#475467', mb: '12px' }}>
        Most endpoints require JWT authentication. Include the token in your request headers:
      </Typography>
      <Box
        sx={{
          p: '12px 16px',
          backgroundColor: '#1e1e1e',
          borderRadius: '4px',
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          color: '#e5e5e5',
        }}
      >
        Authorization: Bearer {'<your-token>'}
      </Box>
    </Box>

    {/* API Categories */}
    <Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1c2130', mb: '16px' }}>
        API categories
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {[
          { label: 'Core resources', count: 6, desc: 'Users, Organizations, Projects, Roles, Invitations, Super admin' },
          { label: 'Risk management', count: 5, desc: 'Project risks, Vendors, Vendor risks, Quantitative risks, Risk benchmarks' },
          { label: 'AI governance', count: 9, desc: 'Model inventory, Model risks, Datasets, Training, AI Trust Centre, AI detection, AI advisor, Agent discovery, Shadow AI' },
          { label: 'Compliance', count: 10, desc: 'Assessments, Policies, Frameworks, EU AI Act, ISO 27001, ISO 42001, NIST AI RMF, FRIA, Compliance score, Approval workflows' },
          { label: 'Utilities', count: 14, desc: 'Files, Email, Dashboard, Search, System & logs, Tasks, Tokens, Preferences, Notes, Notifications, Share links, Reporting, Slack, Subscriptions' },
          { label: 'Advanced', count: 12, desc: 'Evidence hub, AI incidents, CE marking, Automation, Integrations, Intake forms, Entity graph, Post-market monitoring, Plugins, Change history, Audit ledger, LLM keys' },
        ].map((category) => (
          <Box
            key={category.label}
            sx={{
              p: '16px',
              border: '1px solid #eaecf0',
              borderRadius: '4px',
              backgroundColor: '#fcfcfd',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '6px' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1c2130' }}>
                {category.label}
              </Typography>
              <Box
                sx={{
                  px: '6px',
                  py: '2px',
                  borderRadius: '12px',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                }}
              >
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: '#0284c7' }}>
                  {category.count}
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: 11, color: '#667085' }}>
              {category.desc}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);

export default App;
