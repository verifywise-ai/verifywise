import { getAllEntities } from "../repository/entity.repository";

export const fetchData = async (routeUrl: string, setData: (data: any) => void) => {
  try {
    const response = await getAllEntities({ routeUrl });
    setData(response.data);
  } catch (error) {
    console.error(`Error fetching data from ${routeUrl}:`, error);
  }
};
