"""
Pydantic models for bias audit configuration and results.
"""

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


MetricMode = Literal["selection_rate", "scoring_rate", "fairness_metrics"]


class CategoryConfig(BaseModel):
    """Configuration for a single protected category."""
    label: str
    groups: List[str] = Field(default_factory=list)


class IntersectionalConfig(BaseModel):
    """Configuration for intersectional analysis."""
    required: bool = False
    cross: List[str] = Field(default_factory=list)


class ResultsTableConfig(BaseModel):
    """Configuration for a single results table."""
    type: str  # "category" or "intersectional"
    category_key: Optional[str] = None
    title: str


class ResultsFormatConfig(BaseModel):
    """Configuration for results format."""
    tables: List[ResultsTableConfig] = Field(default_factory=list)


class BiasAuditConfig(BaseModel):
    """Full configuration for running a bias audit."""
    preset_id: str
    preset_name: str = ""
    mode: str = "quantitative_audit"
    metric: MetricMode = "selection_rate"
    categories: Dict[str, CategoryConfig] = Field(default_factory=dict)
    intersectional: IntersectionalConfig = Field(default_factory=IntersectionalConfig)
    metrics: List[str] = Field(default_factory=lambda: ["selection_rate", "impact_ratio"])
    threshold: Optional[float] = 0.80
    small_sample_exclusion: Optional[float] = None
    required_metadata: List[str] = Field(default_factory=list)
    metadata: Dict[str, str] = Field(default_factory=dict)
    results_format: ResultsFormatConfig = Field(default_factory=ResultsFormatConfig)
    outcome_column: str = "selected"
    score_column: Optional[str] = None
    prediction_column: Optional[str] = None
    ground_truth_column: Optional[str] = None
    column_mapping: Dict[str, str] = Field(default_factory=dict)

    # Optional audit metadata for the formal PDF report (workstream 2.2)
    system_name: Optional[str] = None
    system_version: Optional[str] = None
    system_description: Optional[str] = None
    auditor_name: Optional[str] = None
    auditor_role: Optional[str] = None
    auditor_independence: Optional[Literal["self", "internal", "third_party"]] = None
    deployment_context: Optional[str] = None
    data_source: Optional[str] = None
    data_date_range_start: Optional[str] = None
    data_date_range_end: Optional[str] = None


class GroupResult(BaseModel):
    """Result for a single demographic group."""
    category_type: str  # "sex", "race_ethnicity", "intersectional"
    category_name: str  # e.g. "Male", "Hispanic or Latino Female"
    applicant_count: int
    selected_count: int
    selection_rate: float
    impact_ratio: Optional[float] = None
    excluded: bool = False
    flagged: bool = False


class CategoryTable(BaseModel):
    """A table of results for one category or intersectional analysis."""
    title: str
    category_key: str  # e.g. "sex", "race_ethnicity", "intersectional"
    rows: List[GroupResult] = Field(default_factory=list)
    highest_group: Optional[str] = None
    highest_rate: Optional[float] = None


class ScoreDistributionBin(BaseModel):
    """A single histogram bin."""
    lower: float
    upper: float
    count: int


class ScoreDistributionGroup(BaseModel):
    """Score distribution for one demographic group."""
    category_type: str
    category_name: str
    count: int
    mean: float
    median: float
    std: float
    bins: List[ScoreDistributionBin] = Field(default_factory=list)
    ks_statistic: Optional[float] = None
    ks_pvalue: Optional[float] = None


class ScoreDistributionTable(BaseModel):
    """Score distribution analysis for one category."""
    title: str
    category_key: str
    groups: List[ScoreDistributionGroup] = Field(default_factory=list)
    overall_mean: float = 0.0
    overall_median: float = 0.0


class ConfusionMatrixGroupResult(BaseModel):
    """Confusion-matrix based fairness metrics for one group."""
    category_type: str
    category_name: str
    count: int
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int
    true_positive_rate: float  # TPR / recall / sensitivity
    false_positive_rate: float
    false_negative_rate: float
    true_negative_rate: float
    precision: float
    accuracy: float
    excluded: bool = False


class FairnessMetricsTable(BaseModel):
    """Confusion-matrix fairness metrics for one category."""
    title: str
    category_key: str
    groups: List[ConfusionMatrixGroupResult] = Field(default_factory=list)
    # Cross-group differences
    equal_opportunity_difference: Optional[float] = None  # max TPR - min TPR
    equalized_odds_difference: Optional[float] = None  # max of TPR-gap or FPR-gap
    predictive_parity_difference: Optional[float] = None  # max precision gap
    tpr_max_group: Optional[str] = None
    tpr_min_group: Optional[str] = None
    fpr_max_group: Optional[str] = None
    fpr_min_group: Optional[str] = None


class BiasAuditResult(BaseModel):
    """Complete results from a bias audit computation."""
    metric: MetricMode = "selection_rate"
    tables: List[CategoryTable] = Field(default_factory=list)
    score_distribution_tables: List[ScoreDistributionTable] = Field(default_factory=list)
    fairness_metrics_tables: List[FairnessMetricsTable] = Field(default_factory=list)
    overall_selection_rate: float = 0.0
    total_applicants: int = 0
    total_selected: int = 0
    unknown_count: int = 0
    flags_count: int = 0
    excluded_count: int = 0
    summary: str = ""
