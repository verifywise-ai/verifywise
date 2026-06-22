---
title: Dataset Inventory — EU AI Act Article 10 Compliance
tags: [dataset-inventory, eu-ai-act-article-10, iso-42001, nist-ai-rmf, data-governance]
source: raw/docs/dataset-inventory-implementation.md
date: 2026-04-30
status: active
---

# Dataset Inventory

## Amaç

VerifyWise'ın formal dataset tracking eksiğini kapatmak — EU AI Act Article 10 (Data Governance) için zorunlu. OneTrust comparison'da identifie edilmiş gap.

## Ne yapıldı

### Neden Önemli

| Standart | Gereklilik |
|---|---|
| **EU AI Act Article 10** | Training/validation/testing dataset, data collection process, labeling, bias examination, gap mitigation dokümante edilmeli |
| **ISO 42001** | Data lineage tracking + quality documentation |
| **NIST AI RMF** | Data source impact on model behavior |

### Dataset Inventory Kapsamı
- Dataset metadata (name, description, source, license, lineage)
- Data preparation history (labeling, cleaning, augmentation)
- Bias examination notes
- Gap identification + mitigation log
- Linked models (which datasets used by which model)

## Değişen dosyalar

- Migration: `dataset-inventory-tables.js`
- `Servers/domain.layer/models/dataset/`
- `Clients/src/presentation/pages/Datasets/`
- Linking table: `dataset_model_inventories`

## Kararlar

- [decision-dataset-as-first-class-entity](../../decisions/decision-dataset-as-first-class-entity.md)

## Kaynaklar

- raw/docs/dataset-inventory-implementation.md (orijinal: 20181 bayt, Feb 2026, v1.1)

## İlgili Sayfalar

- [concept-eu-ai-act-article-10](../../concepts/concept-eu-ai-act-article-10.md)
- [synthesis-compliance-framework-coverage](../../syntheses/synthesis-compliance-framework-coverage.md)
