import { useCallback, useState, useEffect } from "react";
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import {
  listItemStyle,
  pageHeadingStyle,
  subHeadingStyle,
  topicsListStyle,
} from "./index.style";
import { StatsCard } from "../../../components/Cards/StatsCard";
import CustomizableSkeleton from "../../../components/Skeletons";
import AccordionView from "./AccordionView";
import EUAIActQuestionDrawerDialog from "../../../components/Drawer/EUAIActQuestionDrawerDialog";
import useAssessmentProgress from "../../../../application/hooks/useAssessmentProgress";
import useAssessmentTopics from "../../../../application/hooks/useAssessmentTopcis";
import useAssessmentSubtopics from "../../../../application/hooks/useAssessmentSubtopics";
import PageTour from "../../../components/PageTour";
import useMultipleOnScreen from "../../../../application/hooks/useMultipleOnScreen";
import AssessmentSteps from "./AssessmentSteps";
import { Project } from "../../../../domain/types/Project";
import { Question } from "../../../../domain/types/Question";
import { Subtopic } from "../../../../domain/types/Subtopic";
import { useSearchParams } from "react-router-dom";
import { brand, background } from "../../../themes/palette";

const AssessmentTracker = ({
  project,
  statusFilter,
}: {
  project: Project;
  statusFilter?: string;
}) => {
  const theme = useTheme();
  const [refreshKey, setRefreshKey] = useState(false);
  const currentProjectId = project?.id;
  const currentProjectFramework = project.framework?.filter(
    (p) => p.framework_id === 1
  )[0]?.project_framework_id;
  const [searchParams, setSearchParams] = useSearchParams();
  const topicId = searchParams.get("topicId");
  const questionId = searchParams.get("questionId");
  const [activeTab, setActiveTab] = useState<number>(Number(topicId) || 0);
  const [hasAutoOpenedDrawer, setHasAutoOpenedDrawer] = useState(false);
  const [runAssessmentTour, setRunAssessmentTour] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );
  const [selectedSubtopic, setSelectedSubtopic] = useState<Subtopic | null>(
    null
  );
  const [flashingQuestionId, setFlashingQuestionId] = useState<number | null>(
    null
  );
  const [expandedAccordion, setExpandedAccordion] = useState<number | false>(
    false
  );

  const { assessmentProgress, loading: loadingAssessmentProgress } =
    useAssessmentProgress({
      projectFrameworkId: currentProjectFramework,
      refreshKey,
    });

  const { assessmentTopics, loading: loadingAssessmentTopics } =
    useAssessmentTopics();
  const { assessmentSubtopics, loading: loadingAssessmentSubtopic } =
    useAssessmentSubtopics({
      activeAssessmentTopicId: assessmentTopics?.[activeTab]?.id,
      projectFrameworkId: currentProjectFramework,
      refreshKey,
    });

  const { refs, allVisible } = useMultipleOnScreen<HTMLDivElement>({
    countToTrigger: 2,
  });

  useEffect(() => {
    if (allVisible) {
      setRunAssessmentTour(true);
    }
  }, [allVisible]);

  // Reset active tab when project changes
  useEffect(() => {
    setRefreshKey((prev) => !prev); // Force refresh when project changes
  }, [currentProjectId]);

  // Handle topicId from URL to set active tab
  useEffect(() => {
    if (topicId && assessmentTopics && assessmentTopics.length > 0) {
      const topicIndex =
        assessmentTopics.findIndex((topic) => topic.id === parseInt(topicId)) ||
        0;
      if (topicIndex >= 0) {
        setActiveTab(topicIndex);
      }
    }
  }, [topicId, assessmentTopics]);

  // Auto-open drawer when questionId is in URL
  useEffect(() => {
    if (
      questionId &&
      !hasAutoOpenedDrawer &&
      assessmentSubtopics &&
      assessmentSubtopics.length > 0
    ) {
      const targetQuestionId = parseInt(questionId);
      // Find the question and its subtopic
      // assessmentSubtopics has questions array from the hook response
      for (const subtopic of assessmentSubtopics as Array<Subtopic & { questions: Question[] }>) {
        const question = subtopic.questions?.find(
          (q: Question) => q.question_id === targetQuestionId
        );
        if (question) {
          setSelectedQuestion(question);
          setSelectedSubtopic(subtopic);
          setDrawerOpen(true);
          setHasAutoOpenedDrawer(true);
          // Clear URL params after opening
          searchParams.delete("questionId");
          searchParams.delete("topicId");
          setSearchParams(searchParams);
          break;
        }
      }
    }
  }, [questionId, assessmentSubtopics, hasAutoOpenedDrawer, searchParams, setSearchParams]);

  const handleListItemClick = useCallback(
    (index: number) => {
      if (topicId) {
        searchParams.delete("topicId");
        searchParams.delete("questionId");
        setSearchParams(searchParams);
      }
      setActiveTab(index);
    },
    [topicId, searchParams, setSearchParams]
  );

  const handleQuestionClick = (question: Question, subtopic: Subtopic) => {
    setSelectedQuestion(question);
    setSelectedSubtopic(subtopic);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedQuestion(null);
    setSelectedSubtopic(null);
  };

  const handleSaveSuccess = (
    success: boolean,
    _message?: string,
    questionId?: number
  ) => {
    if (success && questionId) {
      // Trigger green flash animation
      setFlashingQuestionId(questionId);
      // Clear flash after 2 seconds
      setTimeout(() => {
        setFlashingQuestionId(null);
      }, 2000);
      // Refresh data
      setRefreshKey((prev) => !prev);
    }
  };

  // Filter subtopics based on the statusFilter, if provided
  const filteredSubtopics = assessmentSubtopics
    ? assessmentSubtopics.map((subtopic: any) => ({
        ...subtopic,
        questions: subtopic.questions.filter(
          (question: Question) =>
            !statusFilter ||
            statusFilter === "all" ||
            question.status.toLowerCase() === statusFilter
        ),
      }))
    : [];

  const topicsList = useCallback(
    (topic: any, index: number) => (
      <ListItem key={topic.id || index} disablePadding sx={listItemStyle}>
        <ListItemButton
          disableRipple
          selected={index === activeTab}
          onClick={() => handleListItemClick(index)}
          sx={{
            padding: 1,
            paddingLeft: 4,
            borderRadius: 2,
            backgroundColor: index === activeTab ? `${brand.primary}` : "transparent",
            width: "100%",
            textWrap: "wrap",
          }}
        >
          <ListItemText
            primary={
              <Typography
                color={
                  index === activeTab ? `${background.main}` : theme.palette.text.primary
                }
                sx={{ fontSize: 13 }}
              >
                {topic.title}
              </Typography>
            }
          />
        </ListItemButton>
      </ListItem>
    ),
    [activeTab, handleListItemClick, theme.palette.text.primary]
  );

  // Show message if no project is selected
  if (!currentProjectId) {
    return (
      <Stack sx={{ padding: 2 }}>
        <Typography>Please select a project to view assessments</Typography>
      </Stack>
    );
  }

  return (
    <Stack className="assessment-tracker">
      <PageTour
        run={runAssessmentTour}
        steps={AssessmentSteps}
        onFinish={() => {
          localStorage.setItem("assessment-tour", "true");
          setRunAssessmentTour(false);
        }}
        tourKey="assessment-tour"
      />
      <Stack
        className="assessment-tracker-holder"
        sx={{
          gap: theme.spacing(2),
          backgroundColor: theme.palette.background.alt,
        }}
      >
        <Stack
          sx={{ marginTop: "10px", gap: theme.spacing(10) }}
          data-joyride-id="assessment-progress-bar"
          ref={refs[0]}
        >
          {loadingAssessmentProgress ? (
            <CustomizableSkeleton
              height={82}
              minHeight={82}
              minWidth={300}
              width={"100%"}
              key={1400}
              variant="rectangular"
            />
          ) : assessmentProgress ? (
            <StatsCard
              total={assessmentProgress.totalQuestions}
              completed={assessmentProgress.answeredQuestions}
              title="Questions"
              progressbarColor={brand.primary}
            />
          ) : (
            <Typography>
              Unable to fetch statistical values from the server
            </Typography>
          )}
        </Stack>
        <Typography sx={{ ...pageHeadingStyle, mt: 4 }}>
          Assessments status overview
        </Typography>
        <Divider sx={{ marginY: 2 }} />
        <Box sx={{ display: "flex", width: "100%", height: "100vh", paddingLeft: "8px", paddingRight: 0 }}>
          <Stack sx={topicsListStyle}>
            <Typography
              sx={subHeadingStyle}
              data-joyride-id="assessment-topics"
              ref={refs[1]}
            >
              High risk conformity assessment
            </Typography>
            <List>
              {loadingAssessmentTopics ? (
                <CustomizableSkeleton
                  height={30}
                  minHeight={30}
                  minWidth={260}
                  width={"100%"}
                  maxWidth={300}
                  variant="rectangular"
                />
              ) : assessmentTopics ? (
                assessmentTopics.map((topic: any, index: number) =>
                  topicsList(topic, index)
                )
              ) : (
                <Typography>Unable to get topics</Typography>
              )}
            </List>
          </Stack>
          <Divider orientation="vertical" flexItem />
          <Stack
            flex={1}
            minWidth={0}
            paddingY={2}
            paddingLeft={8}
            paddingRight={0}
            sx={{ overflowY: "auto" }}
          >
            {loadingAssessmentSubtopic ? (
              <CustomizableSkeleton
                height={30}
                minHeight={30}
                minWidth={260}
                width={"100%"}
                maxWidth={300}
                variant="rectangular"
              />
            ) : filteredSubtopics && filteredSubtopics.length > 0 ? (
              <AccordionView
                subtopics={filteredSubtopics}
                statusFilter={statusFilter}
                onQuestionClick={handleQuestionClick}
                flashingQuestionId={flashingQuestionId}
                onStatusUpdate={() => setRefreshKey((prev) => !prev)}
                expanded={expandedAccordion}
                onExpandedChange={setExpandedAccordion}
                onFlashingChange={setFlashingQuestionId}
              />
            ) : (
              <Typography>Unable to get subtopics</Typography>
            )}
          </Stack>
        </Box>

        {/* Drawer */}
        {selectedQuestion && selectedSubtopic && (
          <EUAIActQuestionDrawerDialog
            open={drawerOpen}
            onClose={handleDrawerClose}
            question={selectedQuestion}
            subtopic={selectedSubtopic}
            currentProjectId={currentProjectId}
            projectFrameworkId={currentProjectFramework}
            onSaveSuccess={handleSaveSuccess}
          />
        )}
      </Stack>
    </Stack>
  );
};

export default AssessmentTracker;
