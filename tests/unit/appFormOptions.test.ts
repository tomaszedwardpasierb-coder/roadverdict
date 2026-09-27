import { describe, expect, it } from "vitest";

import { getFormOptions } from "@/lib/app/formOptions";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";
import { CAR_FINE_LABELS } from "@/lib/tracker/carFineTypes";

const options = getFormOptions();
const values = (groups: { options: { value: string }[] }[]) => groups.flatMap((g) => g.options.map((o) => o.value));

describe("app form options", () => {
  it("offers bike and car their own lists, from the web's own tables", () => {
    expect(values(options.bike.service.groups)).toEqual(expect.arrayContaining(["basic-service", "valve-clearance"]));
    expect(values(options.car.service.groups)).toEqual(expect.arrayContaining(["interim-service", "cabin-filter"]));
    expect(values(options.car.service.groups)).not.toContain("valve-clearance");
    expect(values(options.car.fines.groups).sort()).toEqual(Object.keys(CAR_FINE_LABELS).sort());
  });

  it("labels every option with the web's own wording", () => {
    for (const o of options.bike.service.groups.flatMap((g) => g.options)) expect(o.label).toBe(JOB_LABELS[o.value]);
    for (const o of options.car.service.groups.flatMap((g) => g.options)) expect(o.label).toBe(CAR_JOB_LABELS[o.value]);
    for (const o of options.bike.mods.groups.flatMap((g) => g.options)) expect(o.label).toBe(MOD_LABELS[o.value]);
    for (const o of options.car.labour.groups.flatMap((g) => g.options)) expect(o.label).toBe(CAR_LABOUR_LABELS[o.value]);
  });

  it("carries each vehicle's own reminder defaults", () => {
    expect(options.bike.service.reminderDefaults["full-service"]).toEqual({ type: "mileage", value: 6000 });
    expect(options.car.service.reminderDefaults["full-service"]).toEqual({ type: "mileage", value: 12000 });
    expect(options.bike.bills.reminderDefaults["insurance"]).toEqual({ type: "months", value: 12 });
  });

  it("never offers the same value twice in one list", () => {
    for (const kind of ["bike", "car"] as const) {
      for (const [list, data] of Object.entries(options[kind])) {
        const v = values(data.groups);
        expect(new Set(v).size, `${kind}.${list}`).toBe(v.length);
      }
    }
  });
});
