import { TaskAppLayout } from '../../src/components/layout/TaskAppLayout';

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <TaskAppLayout>{children}</TaskAppLayout>;
}
