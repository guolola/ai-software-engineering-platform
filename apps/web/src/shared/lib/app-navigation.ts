// Provides route changes for shared actions that render outside the app router component tree.
export function navigateAppPath(path: string) {
  const nextUrl = new URL(path, window.location.origin);
  window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const PROJECT_TASK_DRAWER_REQUEST_EVENT = "uml-open-project-task-drawer";

export interface ProjectTaskDrawerRequest {
  clientTaskId?: string | null;
  runId?: string | null;
}

export function requestOpenGenerationTask(detail: ProjectTaskDrawerRequest = {}) {
  window.dispatchEvent(
    new CustomEvent<ProjectTaskDrawerRequest>(PROJECT_TASK_DRAWER_REQUEST_EVENT, {
      detail,
    }),
  );
}
