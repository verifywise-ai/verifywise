import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "./context/ConfigContext";
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";
import StagePage from "./pages/StagePage";
import ConfigEditor from "./pages/ConfigEditor";
import Leaderboard from "./pages/Leaderboard";
import RunHistory from "./pages/RunHistory";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <div style={{ display: "flex", height: "100vh" }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/stage/:stage" element={<StagePage />} />
                <Route path="/config/:name" element={<ConfigEditor />} />
                <Route path="/results/leaderboard" element={<Leaderboard />} />
                <Route path="/results/history" element={<RunHistory />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
