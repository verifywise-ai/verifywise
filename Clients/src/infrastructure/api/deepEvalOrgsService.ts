import CustomAxios from "./customAxios";

export interface OrgMember {
  id: number;
  name: string;
  surname: string;
  email: string;
}

export interface DeepEvalOrg {
  id: string;
  name: string;
  createdAt: string;
  created_at?: string;
  projects_count?: number;
  members?: OrgMember[];
  member_ids?: number[];
}

class DeepEvalOrgsService {
  async getAllOrgs(): Promise<{ orgs: DeepEvalOrg[] }> {
    try {
      const res = await CustomAxios.get("/deepeval/orgs");
      return res.data as { orgs: DeepEvalOrg[] };
    } catch (error: unknown) {
      // Handle 404 (endpoint not available) gracefully - return empty array
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return { orgs: [] };
      }
      throw error;
    }
  }

  async createOrg(name: string, memberIds?: number[]): Promise<{ org: DeepEvalOrg }> {
    const res = await CustomAxios.post("/deepeval/orgs", { name, member_ids: memberIds });
    return res.data as { org: DeepEvalOrg };
  }

  async updateOrg(
    orgId: string,
    name: string,
    memberIds?: number[],
  ): Promise<{ org: DeepEvalOrg }> {
    const res = await CustomAxios.put(`/deepeval/orgs/${orgId}`, { name, member_ids: memberIds });
    return res.data as { org: DeepEvalOrg };
  }

  async deleteOrg(orgId: string): Promise<void> {
    await CustomAxios.delete(`/deepeval/orgs/${orgId}`);
    // If the deleted org was the current one, clear it from local storage
    const current = localStorage.getItem(this.CURRENT_ORG_KEY);
    if (current === orgId) {
      await this.clearCurrentOrg();
    }
  }

  async getProjectsForOrg(orgId: string): Promise<string[]> {
    const res = await CustomAxios.get(`/deepeval/orgs/${orgId}/projects`);
    return (res.data?.projectIds as string[]) || [];
  }

  // Frontend convenience: remember current org locally only for UX
  private CURRENT_ORG_KEY = "vw_evals_current_org";
  async setCurrentOrg(orgId: string): Promise<void> {
    localStorage.setItem(this.CURRENT_ORG_KEY, orgId);
  }
  async getCurrentOrg(): Promise<{ org: DeepEvalOrg | null }> {
    const orgId = localStorage.getItem(this.CURRENT_ORG_KEY);
    if (!orgId) return { org: null };
    const { orgs } = await this.getAllOrgs();
    const org = orgs.find((o) => o.id === orgId) || null;
    return { org };
  }
  async clearCurrentOrg(): Promise<void> {
    localStorage.removeItem(this.CURRENT_ORG_KEY);
  }
  async addProjectToOrg(_orgId: string, _projectId: string): Promise<void> {
    // No-op; association persisted by passing orgId when creating the project
    return;
  }
}

export const deepEvalOrgsService = new DeepEvalOrgsService();
