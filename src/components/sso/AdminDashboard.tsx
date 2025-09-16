import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Users, Settings, Palette, Shield, Save, Loader2, Crown, UserCheck, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getProviderIcon } from "@/lib/oauth-providers";
import { useAuth } from "@/components/sso/SSOProvider";
import type { User, SSOConfig } from "@/types/sso";

interface OAuthProvider {
  name: string;
  displayName: string;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
}

interface AccessControl {
  domainMode: "allow-all" | "whitelist" | "blacklist";
  emailMode: "allow-all" | "whitelist" | "blacklist";
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedEmails?: string[];
  blockedEmails?: string[];
  requireEmailVerification?: boolean;
}

interface Branding {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  loginTitle: string;
  loginSubtitle: string;
  customCss?: string;
}

export function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("providers");
  const { isSuperAdmin, token } = useAuth();

  // Redirect if not super admin
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-red-600 flex items-center justify-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>Super Admin access required</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get SSO configuration
  const { data: ssoConfig, isLoading: configLoading } = useQuery<SSOConfig>({
    queryKey: ["/api/sso/config"],
    queryFn: async () => {
      const res = await fetch("/api/sso/config");
      if (!res.ok) {
        // Fallback to local config file if API not available
        const localRes = await fetch("/sso-config.json");
        if (!localRes.ok) throw new Error("Failed to get SSO config");
        return localRes.json();
      }
      return res.json();
    },
  });

  // Get actual users from the API
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const response = await fetch("/api/admin/users", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: !!token,
  });

  // Mutations for updating configuration
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<SSOConfig>) => {
      // In a real implementation, this would save to the backend
      console.log("Updating config:", newConfig);
      return newConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sso/config"] });
      toast({ title: "Configuration updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update configuration", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'user' | 'admin' | 'super_admin' }) => {
      const response = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update user role');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User role updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user role",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleProviderToggle = async (providerName: string, enabled: boolean) => {
    if (!ssoConfig) return;
    if (providerName === 'tinyauth') {
      console.info('TinyAuth provider is managed by the reverse proxy and cannot be toggled from the UI.');
      return;
    }

    const updatedConfig = {
      ...ssoConfig,
      providers: {
        ...ssoConfig.providers,
        [providerName]: {
          ...ssoConfig.providers[providerName],
          enabled,
        },
      },
    };

    await updateConfigMutation.mutateAsync(updatedConfig);
  };

  const handleProviderUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ssoConfig) return;

    const formData = new FormData(e.currentTarget);
    const providerName = formData.get("providerName") as string;
    if (providerName === 'tinyauth') {
      console.info('TinyAuth configuration is controlled outside of Athena.');
      return;
    }
    const clientId = formData.get("clientId") as string;
    const clientSecret = formData.get("clientSecret") as string;
    const tenantId = formData.get("tenantId") as string;

    const updatedConfig = {
      ...ssoConfig,
      providers: {
        ...ssoConfig.providers,
        [providerName]: {
          ...ssoConfig.providers[providerName],
          clientId,
          clientSecret,
          tenantId: tenantId || undefined,
        },
      },
    };

    await updateConfigMutation.mutateAsync(updatedConfig);
  };

  if (configLoading || usersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!ssoConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-red-600 flex items-center justify-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>Failed to load SSO configuration</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const providers = Object.entries(ssoConfig.providers).map(([name, config]) => ({
    name,
    ...config,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">SSO Administration</h1>
          <p className="text-gray-600">Configure authentication providers and access controls</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="providers" className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Providers</span>
            </TabsTrigger>
            <TabsTrigger value="access" className="flex items-center space-x-2">
              <Settings className="w-4 h-4" />
              <span>Access Control</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center space-x-2">
              <Palette className="w-4 h-4" />
              <span>Branding</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Users</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {providers.map((provider) => {
                    const IconComponent = getProviderIcon(provider.name);
                    const isTinyAuth = provider.name === 'tinyauth';

                    if (isTinyAuth) {
                      return (
                        <Card key={provider.name} className="p-6 border-dashed border-emerald-300 bg-emerald-50/40">
                          <div className="flex items-center space-x-3 mb-4">
                            <IconComponent className="w-6 h-6 text-emerald-600" />
                            <div>
                              <span className="font-semibold text-emerald-700">TinyAuth (reverse proxy)</span>
                              <p className="text-xs text-emerald-700/80">Authentication handled upstream via trusted headers.</p>
                            </div>
                          </div>
                          <ul className="text-sm space-y-2 text-gray-700">
                            <li>• Enabled: {provider.enabled ? 'Yes' : 'No'}</li>
                            <li>• Headers required: <code className="bg-white/60 px-1 py-0.5 rounded">remote-user</code>, <code className="bg-white/60 px-1 py-0.5 rounded">remote-name</code>, <code className="bg-white/60 px-1 py-0.5 rounded">remote-email</code></li>
                            <li>• Configure access in your TinyAuth deployment or proxy.</li>
                          </ul>
                        </Card>
                      );
                    }

                    return (
                      <Card key={provider.name} className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <IconComponent className="w-6 h-6" />
                            <span className="font-semibold">{provider.displayName}</span>
                          </div>
                          <Switch
                            checked={provider.enabled}
                            onCheckedChange={(enabled) => handleProviderToggle(provider.name, enabled)}
                          />
                        </div>
                        <form onSubmit={handleProviderUpdate} className="space-y-3">
                          <input type="hidden" name="providerName" value={provider.name} />
                          <div>
                            <Label className="text-xs">Client ID</Label>
                            <Input
                              name="clientId"
                              defaultValue={(provider as any).clientId || ""}
                              placeholder="Enter client ID"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Client Secret</Label>
                            <Input
                              name="clientSecret"
                              type="password"
                              defaultValue={(provider as any).clientSecret || ""}
                              placeholder="Enter client secret"
                              className="h-8 text-sm"
                            />
                          </div>
                          {provider.name === "microsoft" && (
                            <div>
                              <Label className="text-xs">Tenant ID</Label>
                              <Input
                                name="tenantId"
                                defaultValue={(provider as any).tenantId || ""}
                                placeholder="Enter tenant ID"
                                className="h-8 text-sm"
                              />
                            </div>
                          )}
                          <Button type="submit" size="sm" className="w-full">
                            Update
                          </Button>
                        </form>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Access Control Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Domain Restrictions</h3>
                    <RadioGroup
                      value={ssoConfig.accessControl.domainMode}
                      onValueChange={(value) => {
                        updateConfigMutation.mutate({
                          ...ssoConfig,
                          accessControl: {
                            ...ssoConfig.accessControl,
                            domainMode: value as any,
                          },
                        });
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="allow-all" id="domain-allow-all" />
                        <Label htmlFor="domain-allow-all">Allow all domains</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="whitelist" id="domain-whitelist" />
                        <Label htmlFor="domain-whitelist">Whitelist specific domains</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="blacklist" id="domain-blacklist" />
                        <Label htmlFor="domain-blacklist">Blacklist specific domains</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Email Restrictions</h3>
                    <RadioGroup
                      value={ssoConfig.accessControl.emailMode}
                      onValueChange={(value) => {
                        updateConfigMutation.mutate({
                          ...ssoConfig,
                          accessControl: {
                            ...ssoConfig.accessControl,
                            emailMode: value as any,
                          },
                        });
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="allow-all" id="email-allow-all" />
                        <Label htmlFor="email-allow-all">Allow all emails</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="whitelist" id="email-whitelist" />
                        <Label htmlFor="email-whitelist">Whitelist specific emails</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="blacklist" id="email-blacklist" />
                        <Label htmlFor="email-blacklist">Blacklist specific emails</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Branding & Customization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <Label>Company Name</Label>
                      <Input
                        defaultValue={ssoConfig.branding.companyName}
                        onBlur={(e) => {
                          updateConfigMutation.mutate({
                            ...ssoConfig,
                            branding: {
                              ...ssoConfig.branding,
                              companyName: e.target.value,
                            },
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Logo URL</Label>
                      <Input
                        defaultValue={ssoConfig.branding.logoUrl || ""}
                        placeholder="https://your-domain.com/logo.png"
                        onBlur={(e) => {
                          updateConfigMutation.mutate({
                            ...ssoConfig,
                            branding: {
                              ...ssoConfig.branding,
                              logoUrl: e.target.value || undefined,
                            },
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Primary Color</Label>
                      <div className="flex space-x-2">
                        <Input
                          type="color"
                          className="w-16"
                          defaultValue={ssoConfig.branding.primaryColor}
                          onChange={(e) => {
                            updateConfigMutation.mutate({
                              ...ssoConfig,
                              branding: {
                                ...ssoConfig.branding,
                                primaryColor: e.target.value,
                              },
                            });
                          }}
                        />
                        <Input
                          defaultValue={ssoConfig.branding.primaryColor}
                          onBlur={(e) => {
                            updateConfigMutation.mutate({
                              ...ssoConfig,
                              branding: {
                                ...ssoConfig.branding,
                                primaryColor: e.target.value,
                              },
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Login Page Title</Label>
                      <Input
                        defaultValue={ssoConfig.branding.loginTitle}
                        onBlur={(e) => {
                          updateConfigMutation.mutate({
                            ...ssoConfig,
                            branding: {
                              ...ssoConfig.branding,
                              loginTitle: e.target.value,
                            },
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Login Page Subtitle</Label>
                      <Input
                        defaultValue={ssoConfig.branding.loginSubtitle}
                        onBlur={(e) => {
                          updateConfigMutation.mutate({
                            ...ssoConfig,
                            branding: {
                              ...ssoConfig.branding,
                              loginSubtitle: e.target.value,
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {users?.map((user) => {
                    const getRoleIcon = (role: string) => {
                      switch (role) {
                        case 'super_admin':
                          return <Crown className="w-4 h-4 text-yellow-600" />;
                        case 'admin':
                          return <UserCheck className="w-4 h-4 text-blue-600" />;
                        default:
                          return <UserIcon className="w-4 h-4 text-gray-600" />;
                      }
                    };

                    const getRoleBadgeVariant = (role: string) => {
                      switch (role) {
                        case 'super_admin':
                          return "default" as const;
                        case 'admin':
                          return "secondary" as const;
                        default:
                          return "outline" as const;
                      }
                    };

                    const formatDate = (dateString: string | Date) => {
                      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
                      return date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    };

                return (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">{user.name}</div>
                        <div className="text-sm text-gray-600">{user.email}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant={getRoleBadgeVariant(user.role)} className="flex items-center space-x-1">
                            {getRoleIcon(user.role)}
                            <span>
                              {user.role === 'super_admin' ? 'Super Admin' :
                               user.role === 'admin' ? 'Admin' : 'User'}
                            </span>
                          </Badge>
                          <Badge variant="outline">{user.provider}</Badge>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Joined: {formatDate(user.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Select
                        value={user.role}
                        onValueChange={(newRole: 'user' | 'admin' | 'super_admin') => {
                          if (newRole !== user.role) {
                            updateUserMutation.mutate({
                              id: String(user.id),
                              role: newRole,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">
                            <div className="flex items-center space-x-2">
                              <UserIcon className="w-4 h-4 text-gray-600" />
                              <span>User</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center space-x-2">
                              <UserCheck className="w-4 h-4 text-blue-600" />
                              <span>Admin</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="super_admin">
                            <div className="flex items-center space-x-2">
                              <Crown className="w-4 h-4 text-yellow-600" />
                              <span>Super Admin</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <ManageAeriesButton userId={user.id} userName={user.name} token={token!} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</div>
);
}

export default AdminDashboard;

// ----- Manage Aeries Dialog Button -----
function ManageAeriesButton({ userId, userName, token }: { userId: number; userName: string; token: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState<null | {
    aeries_enabled: boolean;
    can_access_school_data: boolean;
    can_access_student_data: boolean;
    can_view_student_overview: boolean;
    can_view_contact_info: boolean;
    can_view_address_info: boolean;
    can_view_emergency_contacts: boolean;
    can_view_academic_info: boolean;
    can_view_personal_info: boolean;
    can_view_test_records: boolean;
    can_view_programs: boolean;
    can_view_picture: boolean;
    can_view_groups: boolean;
    can_view_fines: boolean;
    can_view_disciplinary_records: boolean;
  }>(null);

  const fetchPerms = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/aeries-permissions`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setPerms({
        aeries_enabled: !!data.aeries_enabled,
        can_access_school_data: !!data.can_access_school_data,
        can_access_student_data: !!data.can_access_student_data,
        can_view_student_overview: !!data.can_view_student_overview,
        can_view_contact_info: !!data.can_view_contact_info,
        can_view_address_info: !!data.can_view_address_info,
        can_view_emergency_contacts: !!data.can_view_emergency_contacts,
        can_view_academic_info: !!data.can_view_academic_info,
        can_view_personal_info: !!data.can_view_personal_info,
        can_view_test_records: !!data.can_view_test_records,
        can_view_programs: !!data.can_view_programs,
        can_view_picture: !!data.can_view_picture,
        can_view_groups: !!data.can_view_groups,
        can_view_fines: !!data.can_view_fines,
        can_view_disciplinary_records: !!data.can_view_disciplinary_records,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = async (o: boolean) => {
    setOpen(o);
    if (o) await fetchPerms();
  };

  const update = (key: keyof NonNullable<typeof perms>) => (val: boolean) => {
    if (!perms) return;
    setPerms({ ...perms, [key]: val });
  };

  const onSave = async () => {
    if (!perms) return;
    setSaving(true);
    try {
      const payload = { ...perms, can_view_student_overview: perms.can_access_student_data };
      await fetch(`/api/admin/users/${userId}/aeries-permissions`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => handleOpenChange(true)}>Manage Aeries</Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aeries Permissions</DialogTitle>
            <DialogDescription>
              Enable Aeries access and choose which areas {userName} can access.
            </DialogDescription>
          </DialogHeader>
          {loading || !perms ? (
            <div className="py-6 text-sm text-gray-600">Loading permissions…</div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Enable Aeries Access</Label>
                  <div className="text-xs text-gray-500">Master switch for Aeries.</div>
                </div>
                <ToggleSwitch checked={perms.aeries_enabled} onCheckedChange={update('aeries_enabled')} />
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">School Data</Label>
                    <div className="text-xs text-gray-500">Access to schools endpoints.</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_access_school_data} onCheckedChange={update('can_access_school_data')} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Student Data</Label>
                    <div className="text-xs text-gray-500">Enables basic student overview data.</div>
                  </div>
                  <ToggleSwitch
                    disabled={!perms.aeries_enabled}
                    checked={perms.can_access_student_data}
                    onCheckedChange={(val: boolean) => {
                      if (!perms) return;
                      setPerms({ ...perms, can_access_student_data: val, can_view_student_overview: val });
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <Label className="font-medium">Personal Information</Label>
                      <div className="text-xs text-gray-500">Demographics and background.</div>
                    </div>
                    <ToggleSwitch disabled={!perms.aeries_enabled || !perms.can_access_student_data} checked={perms.can_view_personal_info} onCheckedChange={update('can_view_personal_info')} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <Label className="font-medium">Contact Information</Label>
                      <div className="text-xs text-gray-500">Emails and phone numbers.</div>
                    </div>
                    <ToggleSwitch disabled={!perms.aeries_enabled || !perms.can_access_student_data} checked={perms.can_view_contact_info} onCheckedChange={update('can_view_contact_info')} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <Label className="font-medium">Address Information</Label>
                      <div className="text-xs text-gray-500">Mailing and residence addresses.</div>
                    </div>
                    <ToggleSwitch disabled={!perms.aeries_enabled || !perms.can_access_student_data} checked={perms.can_view_address_info} onCheckedChange={update('can_view_address_info')} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <Label className="font-medium">Student Picture</Label>
                      <div className="text-xs text-gray-500">Allow viewing student photo.</div>
                    </div>
                    <ToggleSwitch disabled={!perms.aeries_enabled || !perms.can_access_student_data} checked={perms.can_view_picture} onCheckedChange={update('can_view_picture')} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <Label className="font-medium">Student Groups</Label>
                      <div className="text-xs text-gray-500">Allow viewing group memberships.</div>
                    </div>
                    <ToggleSwitch disabled={!perms.aeries_enabled || !perms.can_access_student_data} checked={perms.can_view_groups} onCheckedChange={update('can_view_groups')} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Emergency Contacts</Label>
                    <div className="text-xs text-gray-500">Contacts detail for students.</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_view_emergency_contacts} onCheckedChange={update('can_view_emergency_contacts')} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Academic Information</Label>
                    <div className="text-xs text-gray-500">Grades, transcripts, schedules, attendance.</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_view_academic_info} onCheckedChange={update('can_view_academic_info')} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Test Records</Label>
                    <div className="text-xs text-gray-500">Standardized test results.</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_view_test_records} onCheckedChange={update('can_view_test_records')} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Student Programs</Label>
                    <div className="text-xs text-gray-500">Program enrollments (e.g., special services).</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_view_programs} onCheckedChange={update('can_view_programs')} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Fines and Fees</Label>
                    <div className="text-xs text-gray-500">Student fines via Aeries.</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_view_fines} onCheckedChange={update('can_view_fines')} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Disciplinary Records</Label>
                    <div className="text-xs text-gray-500">Student discipline details.</div>
                  </div>
                  <ToggleSwitch disabled={!perms.aeries_enabled} checked={perms.can_view_disciplinary_records} onCheckedChange={update('can_view_disciplinary_records')} />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
