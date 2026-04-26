import { ToggleSwitch } from "./ui/toggle-switch";
import { usePushNotifications } from "../hooks/usePushNotifications";

interface PushNotificationToggleProps {
  companyId: string;
}

export function PushNotificationToggle({ companyId }: PushNotificationToggleProps) {
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications();

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 opacity-50">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Push notifications</p>
          <p className="text-xs text-muted-foreground">Not supported in this browser</p>
        </div>
        <ToggleSwitch checked={false} onCheckedChange={() => undefined} disabled />
      </div>
    );
  }

  const handleChange = async (checked: boolean) => {
    if (checked) {
      await subscribe(companyId);
    } else {
      await unsubscribe(companyId);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">Push notifications</p>
        <p className="text-xs text-muted-foreground">
          {isSubscribed ? "You will receive push alerts for this workspace" : "Enable push alerts for this workspace"}
        </p>
      </div>
      <ToggleSwitch
        checked={isSubscribed}
        onCheckedChange={handleChange}
        disabled={isLoading}
        aria-label="Toggle push notifications"
      />
    </div>
  );
}
