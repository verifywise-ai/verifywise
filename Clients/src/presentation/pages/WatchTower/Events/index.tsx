import { Stack, Typography, useTheme } from "@mui/material";
import { useState, useEffect } from "react";
import EventsTable from "../../../components/Table/EventsTable";
import { getAllEvents } from "../../../../application/repository/event.repository";
import { Event } from "../../../../domain/types/Event";
import useUsers from "../../../../application/hooks/useUsers";

const WatchTowerEvents = () => {
  const theme = useTheme();
  const { users } = useUsers();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const eventsData = await getAllEvents({ routeUrl: "/logger/events" });
        setEvents(eventsData.data.data);
      } catch (err) {
        console.error("Error fetching events:", err);
        setError("Failed to load events. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, []);

  return (
    <Stack className="watch-tower-events" spacing={theme.spacing(4)}>
      {error && (
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.error.main,
            backgroundColor: theme.palette.error.light,
            padding: theme.spacing(2),
            borderRadius: theme.shape.borderRadius,
          }}
        >
          {error}
        </Typography>
      )}

      <EventsTable data={events} users={users} isLoading={isLoading} paginated={true} />
    </Stack>
  );
};

export default WatchTowerEvents;
