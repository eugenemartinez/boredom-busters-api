import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity.js';
import type { Activity as ActivityTypeAnnotation } from '../../activities/entities/activity.entity.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; // Import Swagger decorators

@Entity('users')
export class User {
  @ApiProperty({ example: 'clx2k9q6o0000u0ph5q5g2q5g', description: 'Unique identifier for the user' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ example: 'user@example.com', description: 'User\'s email address' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  // No @ApiProperty for password_hash as it should not be exposed
  @Column({ type: 'text', select: false })
  password_hash!: string;

  @ApiPropertyOptional({ example: 'cooluser123', description: 'User\'s username (can be null)' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  username!: string | null;

  // No @ApiProperty for current_hashed_refresh_token
  @Column({ type: 'text', nullable: true, select: false })
  current_hashed_refresh_token?: string | null;

  @ApiProperty({ example: '2023-10-27T07:49:12.123Z', description: 'Timestamp of user creation' })
  @CreateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at!: Date;

  @ApiProperty({ example: '2023-10-28T10:20:30.456Z', description: 'Timestamp of last user update' })
  @UpdateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at!: Date;

  @ApiProperty({ type: () => [Activity], description: 'List of activities associated with the user', required: false })
  @OneToMany(() => Activity, (activity) => activity.user)
  activities!: ActivityTypeAnnotation[];
}
