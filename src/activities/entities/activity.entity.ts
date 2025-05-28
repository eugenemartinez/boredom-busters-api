// Import User for decorator value and UserTypeAnnotation for type annotation
import { User } from '../../users/entities/user.entity.js';
import type { User as UserTypeAnnotation } from '../../users/entities/user.entity.js';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index, // Added Index for potential future use on 'type'
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; // Import Swagger decorators

// Enum for CostLevel (optional, but good for type safety)
export enum CostLevel {
  FREE = 'free',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('activities')
export class Activity {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', description: 'Unique identifier for the activity (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ example: 'u1b2c3d4-e5f6-7890-1234-567890abcxyz', description: 'ID of the user who created/owns the activity (UUID)' })
  @Column({ type: 'uuid' })
  user_id!: string;

  // For the 'user' relation:
  // If you return the full user object, it's best to use a DTO like UserResponseDto
  // or ensure the User entity itself is decorated with @ApiProperty.
  // For now, Swagger will infer it as an object if it's part of the response.
  // If you only return user_id, this field might not be part of the direct JSON response unless explicitly selected.
  @ApiPropertyOptional({ type: () => User, description: 'The user object associated with this activity (if loaded/returned)'})
  @ManyToOne(() => User, (user) => user.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserTypeAnnotation;

  @ApiProperty({ example: 'Learn to Play the Ukulele', description: 'The title of the activity', maxLength: 255 })
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @ApiProperty({ example: 'Start with basic chords and strumming patterns. Many tutorials are available online.', description: 'A detailed description of the activity' })
  @Column({ type: 'text' })
  description!: string;

  @ApiProperty({
    example: 'music',
    description: 'Category or type of the activity (e.g., educational, recreational, music)',
    maxLength: 100,
  })
  @Index() // Good for filtering by type
  @Column({
    type: 'varchar',
    length: 100,
    comment:
      'e.g., educational, recreational, social, diy, charity, cooking, relaxation, music, sport, other',
  })
  type!: string;

  @ApiPropertyOptional({ example: 1, description: 'Minimum number of participants required (if applicable)', type: 'integer', nullable: true })
  @Column({ type: 'int', nullable: true, name: 'participants_min' })
  participants_min!: number | null;

  @ApiPropertyOptional({ example: 5, description: 'Maximum number of participants allowed (if applicable)', type: 'integer', nullable: true })
  @Column({ type: 'int', nullable: true, name: 'participants_max' })
  participants_max!: number | null;

  @ApiProperty({
    enum: CostLevel,
    example: CostLevel.FREE,
    description: 'Estimated cost level of the activity',
    default: CostLevel.FREE,
  })
  @Column({
    type: 'enum',
    enum: CostLevel,
    default: CostLevel.FREE,
    name: 'cost_level',
  })
  cost_level!: CostLevel;

  @ApiPropertyOptional({ example: 30, description: 'Minimum estimated duration in minutes (if applicable)', type: 'integer', nullable: true })
  @Column({
    type: 'int',
    nullable: true,
    comment: 'Duration in minutes',
    name: 'duration_min',
  })
  duration_min!: number | null;

  @ApiPropertyOptional({ example: 120, description: 'Maximum estimated duration in minutes (if applicable)', type: 'integer', nullable: true })
  @Column({
    type: 'int',
    nullable: true,
    comment: 'Duration in minutes',
    name: 'duration_max',
  })
  duration_max!: number | null;

  @ApiPropertyOptional({ example: 'Jane Doe', description: 'Name of the user who submitted the activity (if different from owner or for public submissions)', maxLength: 255, nullable: true })
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'contributor_name',
    comment:
      'Name of the user who submitted it, can be derived or explicitly set',
  })
  contributor_name!: string | null;

  @ApiProperty({ example: '2023-10-27T07:49:12.123Z', description: 'Timestamp of when the activity was created' })
  @CreateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
  })
  created_at!: Date;

  @ApiProperty({ example: '2023-10-28T10:20:30.456Z', description: 'Timestamp of when the activity was last updated' })
  @UpdateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    name: 'updated_at',
  })
  updated_at!: Date;
}
