// Place at: src/lib/tracker/dvlaDataFetch.ts
//
// Fetches the VehicleDetails package (same one plate-lookup already
// calls - no new VDG cost) and extracts everything beyond make/model/
// year that plate-lookup currently throws away: import/export/scrapped
// status, cherished-plate marker, keeper history, DVLA's own plate-
// change record, V5C reissue dates, official combined MPG, and Euro
// emissions status. Field paths below are taken directly from real,
// verified VDG responses (the PA63ERB/LL17EVF test calls), not guessed
// from the Java sample - that sample's request params were wrong once
// already this session, so it's not trusted as a schema reference here.
import type { DvlaVehicleData, DvlaKeeperChange, DvlaPlateChange } from "./bike";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

export async function fetchDvlaDataFromVdg(vrm: string): Promise<DvlaVehicleData | null> {
  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return null;
  }

  try {
    const res = await fetch(
      `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=VehicleDetails&vrm=${encodeURIComponent(vrm)}`
    );
    const data = await res.json();

    if (!data?.ResponseInformation?.IsSuccessStatusCode || !data?.Results?.VehicleDetails) {
      return null;
    }

    const vd = data.Results.VehicleDetails;
    const md = data.Results.ModelDetails;

    const status = vd.VehicleStatus ?? {};
    const history = vd.VehicleHistory ?? {};

    const keeperChangeList: DvlaKeeperChange[] = (history.KeeperChangeList ?? []).map((k: any) => ({
      numberOfPreviousKeepers: k.NumberOfPreviousKeepers,
      keeperStartDate: k.KeeperStartDate,
      previousKeeperDisposalDate: k.PreviousKeeperDisposalDate ?? null,
    }));

    const plateChangeList: DvlaPlateChange[] = (history.PlateChangeList ?? []).map((p: any) => ({
      currentVrm: p.CurrentVrm,
      previousVrm: p.PreviousVrm,
      dateOfTransaction: p.DateOfTransaction,
    }));

    const v5cIssueDates: string[] = (history.V5cCertificateList ?? []).map((v: any) => v.IssueDate);

    return {
      fetchedAt: new Date().toISOString(),
      dvlaCurrentVrm: vd.VehicleIdentification?.Vrm,
      isImported: status.IsImported,
      isExported: status.IsExported,
      isScrapped: status.IsScrapped,
      isUnscrapped: status.IsUnscrapped,
      cherishedTransferMarker: status.DvlaCherishedTransferMarker,
      keeperChangeList,
      plateChangeList,
      v5cIssueDates,
      officialCombinedMpg: md?.Performance?.FuelEconomy?.CombinedMpg,
      euroStatus: md?.Emissions?.EuroStatus,
    };
  } catch (err) {
    console.error("VDG vehicle-details fetch failed:", err);
    return null;
  }
}
