from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from typing import List

from models.generated_by import GeneratedBy


class RoleItem(BaseModel):
    role_id: str
    user_role: str
    assistant_role: str
    typical_channels: List[str]
    generated_by: GeneratedBy | None = None


class RolesCatalog(BaseModel):
    version: str
    roles: List[RoleItem]


class ActivityItem(BaseModel):
    activity_id: str
    domain: str
    description: str
    verbs: List[str]
    generated_by: GeneratedBy | None = None


class ActivitiesCatalog(BaseModel):
    version: str
    activities: List[ActivityItem]


class DomainItem(BaseModel):
    domain_id: str
    regulated: bool
    keywords: List[str]
    default: bool = False
    generated_by: GeneratedBy | None = None


class DomainsCatalog(BaseModel):
    version: str
    domains: List[DomainItem]


class IndustryItem(BaseModel):
    industry_id: str
    generated_by: GeneratedBy | None = None


class IndustriesCatalog(BaseModel):
    version: str
    industries: List[IndustryItem]


class OrgContextItem(BaseModel):
    context_id: str
    org_context: str
    generated_by: GeneratedBy | None = None


class OrgContextsCatalog(BaseModel):
    version: str
    org_contexts: List[OrgContextItem]


class BaseTemplate(BaseModel):
    template_id: str
    domain: str
    activity_id: str
    template: str
    generated_by: GeneratedBy | None = None


class BaseTemplatesFile(BaseModel):
    version: str
    templates: List[BaseTemplate]


# Slots filled from role/org context — not looked up in render_vars
CONTEXT_SLOTS: frozenset[str] = frozenset({"assistant_role", "user_role", "org_context", "verb"})


class RenderVarsCatalog(BaseModel):
    model_config = ConfigDict(extra="allow")
    version: str

    def get_domain_vars(self, domain: str) -> dict[str, list[str]]:
        return self.model_extra.get(domain, {})
