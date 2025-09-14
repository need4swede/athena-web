import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/Layout/Sidebar';
import { useAuth } from '@/components/sso/SSOProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { listDbMigrations, runDbMigration, downloadDbBackup, restoreDbFromSql } from '@/lib/database';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';

const DbAdminPage: React.FC = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('settings');
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [migrations, setMigrations] = useState<string[]>([]);
  const [runScripts, setRunScripts] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [dropSchema, setDropSchema] = useState(true);
  const [restoring, setRestoring] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const userRole = isSuperAdmin ? 'super-admin' : (user?.role === 'admin' ? 'admin' : 'user');

  useEffect(() => {
    (async () => {
      try {
        const { migrations, runScripts } = await listDbMigrations();
        setMigrations(migrations);
        setRunScripts(runScripts);
      } catch (e: any) {
        console.error(e);
      }
    })();
  }, []);

  const allOptions = useMemo(() => {
    // Present run_*.sql first, then individual migrations
    return [
      ...runScripts.map((f) => ({ label: f, value: f })),
      ...migrations.map((f) => ({ label: `migrations/${f}`, value: `migrations/${f}` })),
    ];
  }, [migrations, runScripts]);

  const handleBackup = async () => {
    setLoadingBackup(true);
    try {
      const blob = await downloadDbBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `athena_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ description: 'Backup download started.' });
    } catch (e: any) {
      toast({ variant: 'destructive', description: `Backup failed: ${e.message || e}` });
    } finally {
      setLoadingBackup(false);
    }
  };

  const handleRunMigration = async () => {
    if (!selected) {
      toast({ description: 'Select a migration or run script first.' });
      return;
    }
    if (!confirm(`Run migration: ${selected}?`)) return;
    setRunning(true);
    try {
      await runDbMigration(selected);
      toast({ description: `Migration completed: ${selected}` });
    } catch (e: any) {
      toast({ variant: 'destructive', description: `Migration failed: ${e.message || e}` });
    } finally {
      setRunning(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast({ description: 'Choose a .sql file to restore.' });
      return;
    }
    if (!confirm('This will drop and replace the current DB schema. Continue?')) return;
    setRestoring(true);
    try {
      await restoreDbFromSql(restoreFile, dropSchema);
      toast({ description: 'Restore completed.' });
    } catch (e: any) {
      toast({ variant: 'destructive', description: `Restore failed: ${e.message || e}` });
    } finally {
      setRestoring(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Super admin access required.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} userRole={userRole} />
      <main className="flex-1 p-8 space-y-8">
        <h1 className="text-2xl font-semibold">Database Administration</h1>

        <Card>
          <CardHeader>
            <CardTitle>Backup / Export</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">Streams a pg_dumpall of the running database. Download and keep safe.</p>
            <Button onClick={handleBackup} disabled={loadingBackup}>
              {loadingBackup ? 'Preparing...' : 'Download Backup (.sql)'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run Migration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-2">Select migration or run_*.sql</label>
              <div className="flex gap-2">
                <Button variant="outline" className="w-full justify-between" onClick={() => setPickerOpen(true)}>
                  <span className="truncate max-w-[75%]">
                    {selected ? selected : 'Search and select a migration...'}
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Button>
                {selected && (
                  <Button variant="ghost" onClick={() => setSelected(null)}>Clear</Button>
                )}
              </div>
            </div>
            <Button onClick={handleRunMigration} disabled={!selected || running}>
              {running ? 'Running...' : 'Run Migration'}
            </Button>

            <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen}>
              <CommandInput placeholder="Type to filter migrations..." />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                {runScripts.length > 0 && (
                  <CommandGroup heading="Run Scripts">
                    {runScripts.map((f) => (
                      <CommandItem key={f} value={f} onSelect={() => { setSelected(f); setPickerOpen(false); }}>
                        {f}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {runScripts.length > 0 && migrations.length > 0 && <CommandSeparator />}
                {migrations.length > 0 && (
                  <CommandGroup heading="Migrations">
                    {migrations.map((f) => {
                      const val = `migrations/${f}`;
                      return (
                        <CommandItem key={val} value={val} onSelect={() => { setSelected(val); setPickerOpen(false); }}>
                          {val}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </CommandDialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restore Database</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">Upload a .sql backup to restore. This will drop and recreate the public schema.</p>
            <div className="flex items-center gap-3 mb-3">
              <input type="file" accept=".sql" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={dropSchema} onChange={(e) => setDropSchema(e.target.checked)} />
                Drop schema before restore
              </label>
            </div>
            <Button onClick={handleRestore} disabled={!restoreFile || restoring}>
              {restoring ? 'Restoring...' : 'Restore from SQL'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DbAdminPage;
