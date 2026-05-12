/**
 * @fileoverview AI Detection Suppression Model
 *
 * Sequelize model for ai_detection_suppressions table.
 * Org-scoped rules that flag matching findings as suppressed at scan completion.
 *
 * @module domain.layer/models/aiDetection/suppression.model
 */

import { Column, DataType, Model, Table } from "sequelize-typescript";
import {
  ISuppression,
  SuppressionMatchType,
  SuppressionField,
} from "../../interfaces/i.aiDetection";

@Table({
  tableName: "ai_detection_suppressions",
  timestamps: false,
})
export class SuppressionModel extends Model<SuppressionModel> implements ISuppression {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  match_type!: SuppressionMatchType;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  field!: SuppressionField;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  value!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  reason?: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expires_at?: Date | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  created_by?: number | null;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  updated_at?: Date;

  constructor(init?: Partial<ISuppression>) {
    super();
    if (init) {
      Object.assign(this, init);
    }
  }
}
