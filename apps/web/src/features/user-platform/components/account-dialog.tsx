// Hosts the top-bar account modal for profile, MFA, sessions, and login-state actions.
import { Table } from '../../../shared/ui/table';
import { TableCell } from '../../../shared/ui/table';
import { TableBody } from '../../../shared/ui/table';
import { TableHead } from '../../../shared/ui/table';
import { TableRow } from '../../../shared/ui/table';
import { TableHeader } from '../../../shared/ui/table';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Monitor,
  Settings,
  Shield,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { GlobalSettingsPanel } from "../../settings/components/global-settings-panel";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { Avatar, AvatarFallback } from "../../../shared/ui/avatar";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Separator } from "../../../shared/ui/separator";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { ExpandableTabs } from "../../../shared/ui/expandable-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { cn } from "../../../shared/ui/utils";
import { useIsMobile } from "../../../shared/hooks/use-mobile";
import { formatSessionDevice, formatSessionRegion } from "../lib/session-device";
import {
  ACCOUNT_SESSION_RECORD_LIMIT,
  AVATAR_FILE_TYPES,
  MAX_AVATAR_BYTES,
  accountStatusLabel,
  formatDate,
  initials,
} from "../lib/account-dialog-formatting";
import {
  notifyAuthSessionChanged,
  platformApi,
  PlatformApiError,
  type PlatformAccountSession,
  type PlatformMfaSetup,
  type PlatformUser,
} from "../services/platform-api";
import { AccountAvatarPreview } from "./account-avatar-preview";
import { MfaSetupPanel } from "./mfa-setup-panel";

type AccountDialogProps = {
  showTrigger?: boolean;
  onNavigate: (route: string) => void;
  initialUser?: PlatformUser | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function AccountDialog({
  showTrigger = true,
  onNavigate,
  initialUser = null,
  open: controlledOpen,
  onOpenChange,
}: AccountDialogProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(initialUser);
  const [displayName, setDisplayName] = useState(initialUser?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialUser?.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<PlatformMfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [sessions, setSessions] = useState<PlatformAccountSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const openLocationRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!initialUser) return;
    setUser(initialUser);
    setDisplayName(initialUser.displayName);
    setAvatarUrl(initialUser.avatarUrl ?? "");
  }, [initialUser]);

  useEffect(() => {
    let active = true;
    if (initialUser) {
      return () => {
        active = false;
      };
    }
    platformApi
      .me()
      .then((response) => {
        if (!active) return;
        setUser(response.user ?? null);
        setDisplayName(response.user?.displayName ?? "");
        setAvatarUrl(response.user?.avatarUrl ?? "");
        setCurrentSessionId(response.session?.id ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, [initialUser]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setLoading(true);
    setStatus("");
    Promise.all([
      platformApi.getAccountProfile(),
      platformApi.listAccountSessions(),
    ])
      .then(([profile, sessionResponse]) => {
        if (!active) return;
        setUser(profile.user);
        setDisplayName(profile.user.displayName);
        setAvatarUrl(profile.user.avatarUrl ?? "");
        setAvatarFile(null);
        setAvatarError("");
        setMfaEnabled(Boolean(profile.mfa?.enabled ?? profile.user.mfaEnabled));
        setCurrentSessionId(profile.session?.id ?? null);
        setSessions(sessionResponse.sessions);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof PlatformApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setStatus(localizeCaughtFailure(error, t("account.loadFailed")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, t, userId]);

  const title = useMemo(() => user?.displayName || user?.email || t("auth.login"), [t, user]);
  const avatarPreviewSrc = avatarPreviewUrl || avatarUrl;
  const accountStatus = accountStatusLabel(user?.status, {
    active: t("account.normal"),
    disabled: t("account.disabled"),
    pending: t("account.pending"),
    unknown: t("account.unknown"),
  });
  const visibleSessions = sessions.slice(0, ACCOUNT_SESSION_RECORD_LIMIT);

  useEffect(() => {
    openLocationRef.current = open
      ? `${window.location.pathname}${window.location.search}`
      : null;
  }, [open]);

  useEffect(() => {
    const closeIfLocationChanged = () => {
      const openedAt = openLocationRef.current;
      if (!openedAt) return;
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      if (currentLocation !== openedAt) {
        setDialogOpen(false);
      }
    };
    const closeForRouteChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail.path !== "string") return;
      closeIfLocationChanged();
    };
    window.addEventListener("uml-route-change", closeForRouteChange);
    window.addEventListener("popstate", closeIfLocationChanged);
    return () => {
      window.removeEventListener("uml-route-change", closeForRouteChange);
      window.removeEventListener("popstate", closeIfLocationChanged);
    };
  }, [setDialogOpen]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const selectAvatarFile = (file: File | null) => {
    setAvatarError("");
    const clearPendingAvatar = () => {
      setAvatarFile(null);
      setAvatarPreviewUrl((current) => {
        if (current && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(current);
        }
        return "";
      });
    };

    if (!file) {
      clearPendingAvatar();
      return;
    }
    if (!AVATAR_FILE_TYPES.includes(file.type)) {
      clearPendingAvatar();
      setAvatarError(t("account.avatarTypeError"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      clearPendingAvatar();
      setAvatarError(t("account.avatarSizeError"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl((current) => {
      if (current && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(current);
      }
      return objectUrl;
    });
    setAvatarFile(file);
  };

  const closeAccountDialog = () => {
    setDialogOpen(false);
  };

  const keepAccountDialogOpen = useCallback(() => {
    dialogContentRef.current?.focus({ preventScroll: true });
    setDialogOpen(true);
    window.setTimeout(() => {
      setDialogOpen(true);
      dialogContentRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [setDialogOpen]);

  const saveProfile = async () => {
    try {
      let response = await platformApi.updateAccountProfile({
        displayName,
        avatarUrl: avatarUrl.trim() || null,
      });
      if (avatarFile) {
        response = await platformApi.uploadAccountAvatar(avatarFile);
      }
      setUser(response.user);
      setAvatarUrl(response.user.avatarUrl ?? "");
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setAvatarFile(null);
      setAvatarError("");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl("");
      floatingAlert.success(t("account.profileSaved"));
    } catch (error) {
      floatingAlert.error(t("account.profileSaveFailed"));
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      floatingAlert.error(t("account.passwordRequired"));
      return;
    }

    setPasswordSubmitting(true);
    try {
      const response = await platformApi.changePassword({
        currentPassword,
        newPassword,
      });
      if (response.user) setUser(response.user);
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setCurrentPassword("");
      setNewPassword("");
      const refreshed = await platformApi.listAccountSessions().catch(() => null);
      if (refreshed) setSessions(refreshed.sessions);
      floatingAlert.success(t("account.passwordChanged"));
    } catch (error) {
      floatingAlert.error(t("account.passwordChangeFailed"));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const logout = async () => {
    await platformApi.logout().catch((error) => {
      floatingAlert.error(t("account.logoutFailed"));
    });
    setUser(null);
    setSessions([]);
    setCurrentSessionId(null);
    setMfaSetup(null);
    setMfaCode("");
    setDisableCode("");
    setCurrentPassword("");
    setNewPassword("");
    setPasswordSubmitting(false);
    setAvatarFile(null);
    setAvatarError("");
    if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl("");
    setDialogOpen(false);
    onNavigate("/login");
    notifyAuthSessionChanged();
  };

  const revokeOtherSessions = async () => {
    try {
      const result = await platformApi.revokeOtherSessions();
      const refreshed = await platformApi.listAccountSessions();
      setSessions(refreshed.sessions);
      floatingAlert.success(t("account.revokedOthers", { count: result.revokedCount }));
    } catch (error) {
      floatingAlert.error(t("account.revokeFailed"));
    }
  };

  const startMfaSetup = async () => {
    try {
      const setup = await platformApi.setupMfa();
      setMfaSetup(setup);
      floatingAlert.success(t("account.mfaSetupReady"));
    } catch (error) {
      floatingAlert.error(t("account.mfaSetupFailed"));
    }
  };

  const confirmMfa = async () => {
    try {
      const response = await platformApi.confirmMfa({ code: mfaCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setMfaSetup(null);
      setMfaCode("");
      floatingAlert.success(t("account.mfaEnabledSuccess"));
    } catch (error) {
      floatingAlert.error(t("account.mfaEnableFailed"));
    }
  };

  const disableMfa = async () => {
    const trimmedCode = disableCode.trim();
    if (!trimmedCode) {
      floatingAlert.error(t("account.disableCodeRequired"));
      return;
    }

    try {
      const response = await platformApi.updateMfa({ enabled: false, code: trimmedCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setDisableCode("");
      floatingAlert.success(t("account.mfaDisabledSuccess"));
    } catch (error) {
      floatingAlert.error(t("account.mfaDisableFailed"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDialogOpen(true);
      }}
    >
      {showTrigger && <DialogTrigger
        type="button"
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md p-0.5 text-sm font-medium hover:bg-muted md:h-9 md:w-auto md:justify-start md:gap-2 md:pr-2",
          "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        )}
        aria-label={user ? t("auth.account") : t("auth.login")}
        title={user ? t("auth.account") : t("auth.login")}
      >
        <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary text-xs text-primary-foreground">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            initials(user)
          )}
        </span>
        <span className="hidden max-w-24 truncate md:inline">{title}</span>
        {user ? (
          <ShieldCheck className="hidden size-5 text-muted-foreground md:block" />
        ) : (
          <LogIn className="hidden size-5 text-muted-foreground md:block" />
        )}
      </DialogTrigger>}
      <DialogContent
        ref={dialogContentRef}
        showCloseButton={false}
        tabIndex={-1}
        className="top-0 left-0 h-[100dvh] max-h-[100dvh] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none p-0 md:top-1/2 md:left-1/2 md:h-auto md:max-h-[88vh] md:max-w-[1100px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
      >
        <Button variant="ghost"
          type="button"
          data-slot="dialog-close"
          className="absolute top-4 right-4 z-10 opacity-70 hover:opacity-100 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          onClick={closeAccountDialog}
        >
          <X />
          <span className="sr-only">{t("account.close")}</span>
        </Button>
        {!user ? (
          <div className="grid gap-4 p-6">
            <DialogHeader>
              <DialogTitle>{t("auth.loginAccount")}</DialogTitle>
              <DialogDescription>{t("auth.loginDialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("auth.guestRestriction")}
            </div>
            <Button
              onClick={() => {
                setDialogOpen(false);
                onNavigate("/login");
              }}
            >
              <LogIn className="size-4" />
              {t("auth.goToLogin")}
            </Button>
          </div>
        ) : (
          <div className="w-full min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col gap-0 overflow-hidden md:h-[min(85vh,700px)] md:flex-row">
            {isMobile ? (
              <div className="shrink-0 border-b border-border bg-muted/30 p-3 pr-12">
              <DialogHeader className="mb-3 flex-row items-center gap-3 space-y-0 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm">
                  <Settings className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-base">{t("account.settings")}</DialogTitle>
                  <DialogDescription className="truncate text-xs">{t("account.preferences")}</DialogDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto shrink-0"
                  aria-label={t("account.logout")}
                  title={t("account.logout")}
                  onClick={logout}
                >
                  <LogOut className="size-4" />
                </Button>
              </DialogHeader>
              <ExpandableTabs
                value={activeTab}
                onValueChange={setActiveTab}
                ariaLabel={t("account.settings")}
                className="w-full justify-start"
                items={[
                  { value: "profile", label: t("account.profile"), icon: User },
                  { value: "security", label: t("account.security"), icon: Shield },
                  { value: "sessions", label: t("account.sessions"), icon: Monitor },
                  { value: "global", label: t("account.globalSettings"), icon: Settings },
                ]}
              />
              </div>
            ) : (
              <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30 p-4">
              <DialogHeader className="mb-4 flex-row items-center gap-3 space-y-0 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm">
                  <Settings className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-base">{t("account.settings")}</DialogTitle>
                  <DialogDescription className="truncate text-xs">
                    {t("account.preferences")}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <TabsList className="h-auto w-full flex-col items-stretch justify-start overflow-visible rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="profile"
                  className="h-10 flex-none justify-start px-3"
                >
                  <User className="size-4" />
                  {t("account.profile")}
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  className="h-10 flex-none justify-start px-3"
                >
                  <Shield className="size-4" />
                  {t("account.security")}
                </TabsTrigger>
                <TabsTrigger
                  value="sessions"
                  className="h-10 flex-none justify-start px-3"
                >
                  <Monitor className="size-4" />
                  {t("account.sessions")}
                </TabsTrigger>
                <TabsTrigger
                  value="global"
                  className="h-10 flex-none justify-start px-3"
                >
                  <Settings className="size-4" />
                  {t("account.globalSettings")}
                </TabsTrigger>
              </TabsList>

              <div className="mt-auto pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  onClick={logout}
                >
                  <LogOut className="size-4" />
                  {t("account.logout")}
                </Button>
              </div>
              </aside>
            )}

            <ScrollArea
              className="min-h-0 min-w-0 flex-1 bg-background"
              viewportClassName="overflow-x-hidden"
            >
            <main className="min-w-0 p-4 sm:p-6">
              {loading && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("account.loading")}
                </div>
              )}
              {status && <div className="mb-4 rounded-md border border-border bg-muted p-3 text-sm">{status}</div>}

              <TabsContent value="profile" className="m-0 space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-foreground">{t("account.profileTitle")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("account.profileDescription")}</p>
                </div>

                <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-8">
                  <div className="flex shrink-0 flex-col items-center gap-4">
                    <input
                      ref={avatarInputRef}
                      id="account-avatar-file"
                      aria-label={t("account.avatarAria")}
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => selectAvatarFile(event.target.files?.[0] ?? null)}
                    />
                    <label
                      htmlFor="account-avatar-file"
                      className="group relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl font-semibold text-primary shadow-sm"
                    >
                      <AccountAvatarPreview src={avatarPreviewSrc} user={user} />
                      <span className="absolute inset-0 flex items-center justify-center bg-background/75 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="size-5" />
                      </span>
                    </label>
                    <Badge variant="outline" className="border-success/30 text-success">
                      <span className="size-1.5 rounded-full bg-success" />
                      {accountStatus}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <Camera className="size-4" />
                      {t("account.changeAvatar")}
                    </Button>
                    <div className="max-w-40 text-center text-xs leading-5 text-muted-foreground">
                      {t("account.avatarHint")}
                    </div>
                    {avatarFile && (
                      <div className="max-w-40 truncate text-xs text-muted-foreground">
                        {t("account.avatarSelected", { name: avatarFile.name })}
                      </div>
                    )}
                    {avatarError && <p className="max-w-44 text-center text-xs text-destructive">{avatarError}</p>}
                  </div>

                  <div className="grid min-w-0 flex-1 gap-5">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-display-name">{t("account.displayName")}</Label>
                      <Input
                        id="account-display-name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder={t("account.displayNamePlaceholder")}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="account-email">{t("account.email")}</Label>
                      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                        <Input
                          id="account-email"
                          value={user.email}
                          readOnly
                          className=""
                        />
                        <Badge variant="outline" className="w-fit">
                          {user.emailVerified ? (
                            <>
                              <CheckCircle2 className="size-3 text-success" />
                              {t("account.verified")}
                            </>
                          ) : (
                            t("account.unverified")
                          )}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Mail className="size-4 text-muted-foreground" />
                        {t("account.accountStatus")}
                      </div>
                      <div className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-1">
                        <Badge variant="outline">{accountStatus}</Badge>
                        <Badge variant="outline">{user.emailVerified ? t("account.emailVerified") : t("account.emailUnverified")}</Badge>
                        <Badge variant="outline">{mfaEnabled ? t("account.mfaEnabled") : t("account.mfaDisabled")}</Badge>
                      </div>
                    </div>

                  </div>
                </div>

                <Separator />
                <div className="flex justify-end">
                  <Button type="button" onClick={() => void saveProfile()}>
                    <User className="size-4" />
                    {t("account.saveProfile")}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="security" className="m-0 space-y-6">
                <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("account.security")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("account.securityDescription")}</p>
                  </div>
                  <Badge variant="outline" className={cn(mfaEnabled ? "border-success/30 text-success" : "")}>
                    <span className={cn("size-1.5 rounded-full", mfaEnabled ? "bg-success" : "bg-muted-foreground")} />
                    {mfaEnabled ? t("account.mfaEnabled") : t("account.mfaDisabled")}
                  </Badge>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    {t("account.changePassword")}
                  </div>
                  <div className="grid gap-4 text-sm">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-current-password">{t("account.currentPassword")}</Label>
                      <Input
                        id="account-current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-new-password">{t("account.newPassword")}</Label>
                      <Input
                        id="account-new-password"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={changePassword}
                        disabled={passwordSubmitting || !currentPassword || !newPassword}
                      >
                        {passwordSubmitting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <KeyRound className="size-4" />
                        )}
                        {t("account.changePassword")}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    {t("account.mfaTitle")}
                  </div>
                  {!mfaEnabled && !mfaSetup && (
                    <div className="grid gap-4 text-sm text-muted-foreground">
                      <p>{t("account.mfaDescription")}</p>
                      <div>
                        <Button variant="outline" onClick={startMfaSetup}>
                          <ShieldCheck className="size-4" />
                          {t("account.enableMfa")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {mfaSetup && (
                    <MfaSetupPanel
                      setup={mfaSetup}
                      code={mfaCode}
                      onCodeChange={setMfaCode}
                      onConfirm={confirmMfa}
                      className="bg-background"
                    />
                  )}
                  {mfaEnabled && (
                    <div className="grid gap-3 text-sm">
                      <p className="text-muted-foreground">{t("account.mfaEnabledDescription")}</p>
                      <div className="grid gap-1.5">
                        <Label htmlFor="account-disable-mfa-code">{t("account.disableCode")}</Label>
                        <Input
                          id="account-disable-mfa-code"
                          value={disableCode}
                          onChange={(event) => setDisableCode(event.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder={t("account.codePlaceholder")}
                        />
                      </div>
                      <div>
                        <Button variant="outline" onClick={disableMfa} disabled={!disableCode.trim()}>
                          {t("account.disableMfa")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />
                <div className="flex min-w-0 flex-nowrap justify-between gap-2 overflow-x-auto pb-1">
                  <Button variant="outline" onClick={revokeOtherSessions}>
                    {t("account.otherDevices")}
                  </Button>
                  <Button variant="ghost" onClick={logout}>
                    <LogOut className="size-4" />
                    {t("account.logout")}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="sessions" className="m-0 space-y-6">
                <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("account.activeSessions")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("account.activeSessionsDescription")}</p>
                  </div>
                  <Button variant="ghost" className="justify-start" onClick={revokeOtherSessions}>
                    <LogOut className="size-4" />
                    {t("account.revokeOthers")}
                  </Button>
                </div>

                <div className="max-w-full overflow-x-auto rounded-md border border-border">
                  <Table
                    className="min-w-[720px] table-fixed border-collapse text-left text-sm"
                    aria-label={t("account.activeSessions")}
                  >
                    <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[34%] px-4 py-2 font-medium">{t("account.deviceHeader")}</TableHead>
                        <TableHead className="w-[18%] px-4 py-2 font-medium">{t("account.regionHeader")}</TableHead>
                        <TableHead className="w-[24%] whitespace-normal px-4 py-2 font-medium">{t("account.lastActiveHeader")}</TableHead>
                        <TableHead className="w-[24%] whitespace-normal px-4 py-2 font-medium">{t("account.expiresHeader")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleSessions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="px-4 py-4 text-center text-sm text-muted-foreground">
                            {t("account.noSessions")}
                          </TableCell>
                        </TableRow>
                      ) : visibleSessions.map((session) => {
                        const isCurrent = session.id === currentSessionId;
                        return (
                          <TableRow
                            key={session.id}
                            className={cn(isCurrent && "bg-primary/5 hover:bg-primary/10")}
                          >
                            <TableCell className="overflow-hidden px-4 py-3 whitespace-normal">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar size="lg">
                                  <AvatarFallback className="bg-muted text-primary">
                                    <Laptop aria-hidden="true" className="size-5" />
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className="min-w-0 truncate font-medium text-foreground">
                                      {formatSessionDevice(session.userAgent, t("account.unknownDevice"))}
                                    </span>
                                    {isCurrent && <Badge variant="outline" className="shrink-0">{t("account.currentDevice")}</Badge>}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-normal">
                              {formatSessionRegion(session, t("account.unknownRegion"))}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
                              {formatDate(session.lastSeenAt, locale, t("account.none"))}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
                              {formatDate(session.expiresAt, locale, t("account.none"))}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

              </TabsContent>

              <TabsContent value="global" keepMounted className="m-0 space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-foreground">{t("account.globalSettings")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("account.globalSettingsDescription")}</p>
                </div>
                <GlobalSettingsPanel
                  active={open}
                  currentUserId={userId ?? ""}
                  onNavigate={(route) => {
                    setDialogOpen(false);
                    onNavigate(route);
                  }}
                />
              </TabsContent>

              <div className="sr-only" aria-live="polite">
                {currentSessionId ? t("account.currentSession", { id: currentSessionId }) : ""}
              </div>
            </main>
            </ScrollArea>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
