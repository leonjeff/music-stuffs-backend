import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(['videoId'])
@Index(['userId'])
@Index(['videoId', 'userId'])
export class Loop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  videoId: string;

  @Column()
  userId: string;

  @Column('float')
  startTime: number;

  @Column('float')
  endTime: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ default: false })
  isRecommended: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
