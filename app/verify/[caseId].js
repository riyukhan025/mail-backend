import { useLocalSearchParams } from "expo-router";
import CandidateWebVerifyScreen from "../CandidateWebVerifyScreen";

export default function VerifyCaseRoute() {
  const params = useLocalSearchParams();

  const caseId = String(params?.caseId || "").trim();
  const token = String(params?.t || "").trim();
  return <CandidateWebVerifyScreen caseId={caseId} token={token} />;
}
