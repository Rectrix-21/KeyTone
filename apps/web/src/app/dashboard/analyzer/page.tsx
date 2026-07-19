import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function AnalyzerPage() {
  return (
    <ToolPageShell active="analyzer">
      <FeatureWorkspace featureRoute="analyzer" />
    </ToolPageShell>
  );
}
