// Place at: src/lib/app/formOptions.ts
//
// The choices the Android app's logging forms offer - service jobs, part
// categories, labour jobs, bill/fine/toll types and the default "remind me
// again" intervals - taken straight from the same label and group tables
// the web forms use, so the two can never offer different lists.
import { JOB_GROUPS, JOB_LABELS, JOB_REMINDER_DEFAULTS } from "@/lib/tracker/jobTypes";
import { CAR_JOB_GROUPS, CAR_JOB_LABELS, CAR_JOB_REMINDER_DEFAULTS } from "@/lib/tracker/carJobTypes";
import { MOD_GROUPS, MOD_LABELS } from "@/lib/tracker/modTypes";
import { CAR_MOD_GROUPS, CAR_MOD_LABELS } from "@/lib/tracker/carModTypes";
import { LABOUR_GROUPS, LABOUR_LABELS } from "@/lib/tracker/labourTypes";
import { CAR_LABOUR_GROUPS, CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from "@/lib/tracker/billTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { FINE_LABELS } from "@/lib/tracker/fineTypes";
import { CAR_FINE_LABELS } from "@/lib/tracker/carFineTypes";
import { TOLL_LABELS } from "@/lib/tracker/tollTypes";
import { CAR_TOLL_LABELS } from "@/lib/tracker/carTollTypes";

export type Option = { value: string; label: string };
export type OptionGroup = { label: string; options: Option[] };
export type ReminderDefault = { type: "mileage" | "months"; value: number; note?: string };

export type VehicleFormOptions = {
  service: { groups: OptionGroup[]; reminderDefaults: Record<string, ReminderDefault> };
  mods: { groups: OptionGroup[] };
  labour: { groups: OptionGroup[] };
  bills: { groups: OptionGroup[]; reminderDefaults: Record<string, ReminderDefault> };
  fines: { groups: OptionGroup[] };
  tolls: { groups: OptionGroup[] };
};

function option(value: string, labels: Record<string, string>): Option {
  return { value, label: labels[value] ?? value };
}

function flat(labels: Record<string, string>): OptionGroup[] {
  return [{ label: "", options: Object.keys(labels).map((v) => option(v, labels)) }];
}

function jobGroups(groups: { group: string; jobs: string[] }[], labels: Record<string, string>): OptionGroup[] {
  return groups.map((g) => ({ label: g.group, options: g.jobs.map((j) => option(j, labels)) }));
}

// Parts are grouped twice on the web (group, then subcategory); the app
// shows one level, so a subcategory other than "General" is folded into
// the group's heading.
function modGroups(groups: { group: string; subgroups: { subcategory: string; mods: string[] }[] }[], labels: Record<string, string>): OptionGroup[] {
  return groups.flatMap((g) =>
    g.subgroups.map((s) => ({
      label: s.subcategory && s.subcategory !== "General" ? `${g.group} - ${s.subcategory}` : g.group,
      options: s.mods.map((m) => option(m, labels)),
    }))
  );
}

export function getFormOptions(): { bike: VehicleFormOptions; car: VehicleFormOptions } {
  return {
    bike: {
      service: { groups: jobGroups(JOB_GROUPS, JOB_LABELS), reminderDefaults: JOB_REMINDER_DEFAULTS },
      mods: { groups: modGroups(MOD_GROUPS, MOD_LABELS) },
      labour: { groups: jobGroups(LABOUR_GROUPS, LABOUR_LABELS) },
      bills: { groups: flat(BILL_LABELS), reminderDefaults: BILL_REMINDER_DEFAULTS },
      fines: { groups: flat(FINE_LABELS) },
      tolls: { groups: flat(TOLL_LABELS) },
    },
    car: {
      service: { groups: jobGroups(CAR_JOB_GROUPS, CAR_JOB_LABELS), reminderDefaults: CAR_JOB_REMINDER_DEFAULTS },
      mods: { groups: modGroups(CAR_MOD_GROUPS, CAR_MOD_LABELS) },
      labour: { groups: jobGroups(CAR_LABOUR_GROUPS, CAR_LABOUR_LABELS) },
      bills: { groups: flat(CAR_BILL_LABELS), reminderDefaults: BILL_REMINDER_DEFAULTS },
      fines: { groups: flat(CAR_FINE_LABELS) },
      tolls: { groups: flat(CAR_TOLL_LABELS) },
    },
  };
}
