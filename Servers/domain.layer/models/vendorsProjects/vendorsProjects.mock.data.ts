import { IVendorsProjects } from "../../interfaces/i.vendorProjects";

export const vendorsProjects = (
  vendorId1: number,
  vendorId2: number,
  vendorId3: number,
  vendorId4: number,
  projectId1: number,
  projectId2: number,
): IVendorsProjects[] => {
  return [
    { vendor_id: vendorId1, project_id: projectId1 },
    { vendor_id: vendorId2, project_id: projectId1 },
    { vendor_id: vendorId3, project_id: projectId2 },
    { vendor_id: vendorId4, project_id: projectId2 },
  ];
};
