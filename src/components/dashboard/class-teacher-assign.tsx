"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { assignClassTeacherAction } from "@/lib/actions/class-teacher";

export type TeacherOption = { id: string; name: string };

export function ClassTeacherAssignDialog({
  open,
  onOpenChange,
  classId,
  className,
  currentTeacherId,
  teachers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  currentTeacherId: string | null;
  teachers: TeacherOption[];
}) {
  const router = useRouter();
  const action = useAction();
  const [teacherId, setTeacherId] = React.useState<string>(currentTeacherId ?? "");

  React.useEffect(() => {
    if (open) {
      React.startTransition(() => {
        setTeacherId(currentTeacherId ?? "");
      });
    }
  }, [currentTeacherId, open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    action.run(() => assignClassTeacherAction({ classId, teacherId: teacherId || null }), {
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sinf rahbarini tayinlash</DialogTitle>
          <DialogDescription>{className} sinfiga sinf rahbarini tanlang</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teacher">O‘qituvchi</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger id="teacher">
                <SelectValue placeholder="Tanlang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">(Bekor qilish)</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Bekor
            </Button>
            <Button type="submit" disabled={action.pending}>
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
