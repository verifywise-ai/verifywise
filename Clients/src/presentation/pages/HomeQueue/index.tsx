import { useSearchParams } from "react-router";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import TabBar from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { useTranslation } from "../../../application/hooks/useTranslation";
import StartHereContent from "../StartHere/StartHereContent";
import TodayTab from "./TodayTab";

const TODAY = "today";
const GET_STARTED = "get-started";
const HOME_TABS: readonly string[] = [TODAY, GET_STARTED];

const panelSx = { padding: "0px" };

/**
 * Home (`/home`): the Today queue and, as a second tab, the Start here
 * content. The tab lives in `?tab=` (today | get-started) so links such as
 * Today's empty state and the `/start-here` redirect can open a tab directly.
 * The page title is "Home"; each tab opens with its own greeting line.
 */
const HomePage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = requested && HOME_TABS.includes(requested) ? requested : TODAY;

  return (
    <PageHeaderExtended title={t("Home")}>
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            { label: t("Today"), value: TODAY, icon: "CheckSquare" },
            { label: t("Get started"), value: GET_STARTED, icon: "Compass" },
          ]}
          activeTab={activeTab}
          onChange={(_, value) => setSearchParams({ tab: value })}
          dataJoyrideId="home-tabs"
        />
        <TabPanel value={TODAY} sx={panelSx}>
          <TodayTab />
        </TabPanel>
        <TabPanel value={GET_STARTED} sx={panelSx} data-testid="home-get-started-tab">
          <StartHereContent embedded />
        </TabPanel>
      </TabContext>
    </PageHeaderExtended>
  );
};

export default HomePage;
