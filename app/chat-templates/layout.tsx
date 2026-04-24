import { TaskAppLayout } from '../../src/components/layout/TaskAppLayout';

export default function ChatTemplatesLayout({ children }: { children: React.ReactNode }) {
  return <TaskAppLayout>{children}</TaskAppLayout>;
}
