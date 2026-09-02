import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BoxingProfileQuestionnaire } from "@/components/BoxingProfileQuestionnaire";
import { QUESTIONS } from "@/lib/boxingProfile";
import { studentIdForProfile, submitBoxingProfileAssessment } from "@/integrations/backend/api";

export default function StudentPerfilLutadorQuestionario() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  if (!profile) return null;

  return (
    <div className="page-container">
      <BoxingProfileQuestionnaire
        questions={QUESTIONS}
        draftKey={`bb.boxing-profile-draft.self.${profile.id}`}
        onSubmit={(answers) => submitBoxingProfileAssessment(studentId!, answers)}
        onSuccess={(assessment) => navigate(`/app/perfil-lutador/resultado/${assessment.id}`, { replace: true })}
        onExit={() => navigate("/app/perfil-lutador")}
      />
    </div>
  );
}
