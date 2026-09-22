// Owns project settings, provider policy, retention, and high-risk project actions.
import { Alert } from '../../../shared/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui/card";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { PageHeader } from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";
import {
  ACADEMIC_BINDING_OPTIONS,
  academicBindingFromValue,
} from "../lib/academic-binding";
import {
  platformApi,
  type PlatformProject,
} from "../services/platform-api";
import { ProjectBackgroundPicker } from "./project-background-picker";

export function ProjectSettings({
  project,
  membershipRole,
  layout = "page",
  onProjectDeleted,
}: {
  project: PlatformProject;
  membershipRole?: string | null;
  layout?: "page" | "drawer";
  onProjectDeleted?: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [visibility, setVisibility] = useState(project.visibility);
  const [courseTeam, setCourseTeam] = useState<string>(
    ACADEMIC_BINDING_OPTIONS.find(
      (option) =>
        option.courseId === project.courseId &&
        option.classId === project.classId &&
        option.teamId === project.teamId,
    )?.value ?? "unassigned",
  );
  const [backgroundKey, setBackgroundKey] = useState<ProjectBackgroundKey | null>(
    project.backgroundKey ?? null,
  );
  const [retentionPolicy, setRetentionPolicy] = useState(project.retentionPolicy ?? "manual");
  const [newOwnerUserId, setNewOwnerUserId] = useState("");
  const [currentProject, setCurrentProject] = useState(project);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setVisibility(project.visibility);
    setCourseTeam(
      ACADEMIC_BINDING_OPTIONS.find(
        (option) =>
          option.courseId === project.courseId &&
          option.classId === project.classId &&
          option.teamId === project.teamId,
      )?.value ?? "unassigned",
    );
    setBackgroundKey(project.backgroundKey ?? null);
    setRetentionPolicy(project.retentionPolicy ?? "manual");
    setNewOwnerUserId("");
    setCurrentProject(project);
    setDeleteDialogOpen(false);
    setDeletingProject(false);
  }, [project]);

  const saveProject = async () => {
    setMessage("");
    setError("");
    try {
      const academicBinding = academicBindingFromValue(courseTeam);
      const response = await platformApi.updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        organizationId: academicBinding.organizationId,
        courseId: academicBinding.courseId,
        classId: academicBinding.classId,
        teamId: academicBinding.teamId,
        backgroundKey,
      });
      const retentionResponse = await platformApi.updateProjectRetentionPolicy(
        project.id,
        retentionPolicy,
      );
      setCurrentProject({ ...response.project, retentionPolicy: retentionResponse.project.retentionPolicy });
      setMessage(t("projectSettings.messages.saved"));
    } catch (saveError) {
      setError(t("projectSettings.errors.save"));
    }
  };

  const archiveProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm(t("projectSettings.confirm.archive"))) return;
    try {
      const response = await platformApi.archiveProject(project.id);
      setCurrentProject(response.project);
      setMessage(t("projectSettings.messages.archived"));
    } catch (archiveError) {
      setError(t("projectSettings.errors.archive"));
    }
  };

  const restoreProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm(t("projectSettings.confirm.restore"))) return;
    try {
      const response = await platformApi.restoreProject(project.id);
      setCurrentProject(response.project);
      setMessage(t("projectSettings.messages.restored"));
    } catch (restoreError) {
      setError(t("projectSettings.errors.restore"));
    }
  };

  const transferOwner = async () => {
    setMessage("");
    setError("");
    const trimmedOwnerId = newOwnerUserId.trim();
    if (!trimmedOwnerId) {
      setError(t("projectSettings.errors.ownerRequired"));
      return;
    }
    if (!window.confirm(t("projectSettings.confirm.transfer"))) return;
    try {
      const response = await platformApi.transferProjectOwner(project.id, trimmedOwnerId);
      setCurrentProject(response.project);
      setNewOwnerUserId("");
      setMessage(t("projectSettings.messages.transferred"));
    } catch (transferError) {
      setError(t("projectSettings.errors.transfer"));
    }
  };

  const confirmDeleteProject = async () => {
    if (deletingProject) return;
    setMessage("");
    setError("");
    setDeletingProject(true);
    try {
      await platformApi.deleteProject(project.id);
      setCurrentProject((current) => ({ ...current, status: "deleted" }));
      setMessage(t("projectSettings.messages.deleted"));
      setDeleteDialogOpen(false);
      onProjectDeleted?.(project.id);
    } catch (deleteError) {
      setError(t("projectSettings.errors.delete"));
    } finally {
      setDeletingProject(false);
    }
  };

  const settingGridClass =
    layout === "drawer" ? "grid min-w-0 max-w-full gap-4 overflow-hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]";
  const sectionClass = layout === "drawer" ? "min-w-0 max-w-full overflow-hidden" : "";
  const canManageProjectSettings =
    !membershipRole || membershipRole === "owner";
  const settingsBlockedReason = t("projectSettings.permissionDenied");
  // Inline the owner-required failure on its own field instead of the shared banner.
  const ownerRequiredMessage = t("projectSettings.errors.ownerRequired");
  const showOwnerFieldError = error === ownerRequiredMessage;
  const feedback = message || (error && !showOwnerFieldError ? error : "");

  return (
    <>
    <div className={cn(layout === "page" && "grid min-w-0 gap-6")}>
      {layout === "page" && (
        <PageHeader
          title={t("projectSettings.basic")}
          description={t("projectSettings.basicDescription")}
          className="mb-0 lg:mb-0"
        />
      )}
      <div className={settingGridClass}>
        <Card as="section" className={cn("gap-6 shadow-none", sectionClass)}>
          {layout === "drawer" && (
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("projectSettings.basic")}</CardTitle>
              <CardDescription className="text-xs">
                {t("projectSettings.basicDescription")}
              </CardDescription>
            </CardHeader>
          )}
          <CardContent>
            <FieldGroup className={cn(layout === "drawer" && "gap-4")}>
              {!canManageProjectSettings && (
                <Alert className="text-xs">
                  {settingsBlockedReason}
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="settings-project-name">{t("projectSettings.name")}</FieldLabel>
                <Input
                  id="settings-project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canManageProjectSettings}
                  title={!canManageProjectSettings ? settingsBlockedReason : undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-project-description">{t("projectSettings.description")}</FieldLabel>
                <Input
                  id="settings-project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("projectSettings.noDescription")}
                  disabled={!canManageProjectSettings}
                  title={!canManageProjectSettings ? settingsBlockedReason : undefined}
                />
              </Field>
              <Field>
                <FieldLabel>{t("projectSettings.background")}</FieldLabel>
                <ProjectBackgroundPicker
                  name={name}
                  value={backgroundKey}
                  onChange={setBackgroundKey}
                  disabled={!canManageProjectSettings}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-project-visibility">{t("projectSettings.visibility")}</FieldLabel>
                <SelectControl
                  id="settings-project-visibility"
                  value={visibility}
                  onValueChange={setVisibility}
                  disabled={!canManageProjectSettings}
                  options={[
                    { value: "private", label: t("projectSettings.visibilityValues.private") },
                    { value: "team", label: t("projectSettings.visibilityValues.team") },
                    { value: "public", label: t("projectSettings.visibilityValues.public") },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-course-team">{t("projectSettings.academicBinding")}</FieldLabel>
                <SelectControl
                  id="settings-course-team"
                  value={courseTeam}
                  onValueChange={setCourseTeam}
                  disabled={!canManageProjectSettings}
                  options={ACADEMIC_BINDING_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.value === "unassigned" ? t("projectSettings.unassigned") : option.label,
                  }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-retention-policy">{t("projectSettings.retention.title")}</FieldLabel>
                <SelectControl
                  id="settings-retention-policy"
                  value={retentionPolicy}
                  onValueChange={setRetentionPolicy}
                  disabled={!canManageProjectSettings}
                  options={[
                    { value: "semester_180_days", label: t("projectSettings.retention.semester") },
                    { value: "one_year_365_days", label: t("projectSettings.retention.year") },
                    { value: "manual", label: t("projectSettings.retention.manual") },
                  ]}
                />
              </Field>
              <Button
                type="button"
                className="w-fit"
                onClick={() => void saveProject()}
                disabled={!canManageProjectSettings}
                title={!canManageProjectSettings ? settingsBlockedReason : undefined}
              >
                {t("projectSettings.save")}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card as="section" className={cn("gap-6 border border-destructive/40 shadow-none", sectionClass)}>
          <CardHeader>
            <CardTitle className="text-base">{t("projectSettings.danger.title")}</CardTitle>
            <CardDescription>
              {t("projectSettings.danger.description", { status: t(`projectSettings.status.${currentProject.status}`, { defaultValue: currentProject.status }) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void archiveProject()}
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            >
              <Archive className="size-4" />
              {t("projectSettings.actions.archive")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void restoreProject()}
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            >
              {t("projectSettings.actions.restore")}
            </Button>
            <Field className="gap-2">
              <FieldLabel htmlFor="settings-transfer-owner">{t("projectSettings.actions.transfer")}</FieldLabel>
              <Input
                id="settings-transfer-owner"
                value={newOwnerUserId}
                onChange={(event) => setNewOwnerUserId(event.target.value)}
                placeholder={t("projectSettings.ownerPlaceholder")}
                disabled={!canManageProjectSettings}
                title={!canManageProjectSettings ? settingsBlockedReason : undefined}
              />
              {showOwnerFieldError && <FieldError>{ownerRequiredMessage}</FieldError>}
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => void transferOwner()}
                disabled={!canManageProjectSettings}
                title={!canManageProjectSettings ? settingsBlockedReason : undefined}
              >
                {t("projectSettings.actions.transfer")}
              </Button>
            </Field>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={!canManageProjectSettings || deletingProject}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            >
              {deletingProject ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("projectSettings.actions.delete")}
            </Button>
            {feedback && (
              <Alert variant={message ? "default" : "destructive"} className="text-sm">
                {feedback}
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projectSettings.deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("projectSettings.deleteDialog.description", { name: currentProject.name })}
          </DialogDescription>
        </DialogHeader>
        {error && !showOwnerFieldError && (
          <Alert variant="destructive" className="text-sm">
            {error}
          </Alert>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deletingProject}
          >
            {t("projectSettings.deleteDialog.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmDeleteProject()}
            disabled={deletingProject}
          >
            {deletingProject ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("projectSettings.deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
