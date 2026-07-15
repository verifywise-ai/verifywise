import { apiServices } from "../../infrastructure/api/networkServices";
import { getDeduped } from "../../infrastructure/api/inflightGet";

export async function getAllProjects({
  signal,
  forceFresh = false,
}: {
  signal?: AbortSignal;
  /**
   * Bypass in-flight dedup and always issue a fresh request. Required after a
   * mutation (project create/edit) so the refresh cannot resolve to an older
   * /projects request that is still in flight and predates the change.
   */
  forceFresh?: boolean;
} = {}): Promise<any> {
  // Deduped by default: the dashboard shell and the metrics hook both request
  // /projects on first login, and sharing the in-flight promise collapses them
  // into one call. Freshness-critical callers opt out with forceFresh.
  const response =
    forceFresh || signal
      ? await apiServices.get("/projects", { signal })
      : await getDeduped("/projects");
  return response.data;
}

export async function getProjectById({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/projects/${id}`, {
    signal,
  });
  return response.data;
}

export async function createProject({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/projects", body);
  return response;
}

export async function updateProject({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.patch(`/projects/${id}`, body);
  return response;
}

export async function deleteProject({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/projects/${id}`);
  return response;
}

export async function getProjectProgressData({
  routeUrl,
  signal,
}: {
  routeUrl: string;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(routeUrl, {
    signal,
  });
  return response.data;
}
