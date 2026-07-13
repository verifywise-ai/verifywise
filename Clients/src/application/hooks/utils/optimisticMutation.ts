import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

export interface OptimisticListMutationContext<TData> {
  previousData: TData | undefined;
  queryKey: readonly unknown[];
}

export interface UseOptimisticListMutationConfig<
  TItem extends { id?: string | number },
  TData = TItem[],
  TError = Error,
  TVariables = unknown,
> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: (variables: TVariables) => readonly unknown[];
  updateItem: (variables: TVariables) => (item: TItem) => TItem;
  invalidateKeys?: (variables: TVariables) => readonly (readonly unknown[])[];
  options?: Omit<
    UseMutationOptions<TData, TError, TVariables, OptimisticListMutationContext<TItem[]>>,
    "mutationFn" | "onMutate" | "onError" | "onSettled"
  >;
}

export function useOptimisticListMutation<
  TItem extends { id?: string | number },
  TData = TItem[],
  TError = Error,
  TVariables = unknown,
>(
  config: UseOptimisticListMutationConfig<TItem, TData, TError, TVariables>,
): UseMutationResult<TData, TError, TVariables, OptimisticListMutationContext<TItem[]>> {
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables, OptimisticListMutationContext<TItem[]>>({
    mutationFn: config.mutationFn,
    onMutate: async (variables) => {
      const queryKey = config.queryKey(variables);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<TItem[]>(queryKey);
      if (previousData) {
        queryClient.setQueryData<TItem[]>(queryKey, (old) =>
          old?.map(config.updateItem(variables)),
        );
      }
      return { previousData, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
    },
    onSettled: (_data, _error, variables, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      config.invalidateKeys?.(variables).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    ...config.options,
  });
}

export interface OptimisticDetailMutationContext<TData> {
  previousData: TData | undefined;
  queryKey: readonly unknown[];
}

export interface UseOptimisticDetailMutationConfig<TData, TError = Error, TVariables = unknown> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: (variables: TVariables) => readonly unknown[];
  updateData: (old: TData | undefined, variables: TVariables) => TData | undefined;
  invalidateKeys?: (variables: TVariables) => readonly (readonly unknown[])[];
  options?: Omit<
    UseMutationOptions<TData, TError, TVariables, OptimisticDetailMutationContext<TData>>,
    "mutationFn" | "onMutate" | "onError" | "onSettled"
  >;
}

export function useOptimisticDetailMutation<TData, TError = Error, TVariables = unknown>(
  config: UseOptimisticDetailMutationConfig<TData, TError, TVariables>,
): UseMutationResult<TData, TError, TVariables, OptimisticDetailMutationContext<TData>> {
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables, OptimisticDetailMutationContext<TData>>({
    mutationFn: config.mutationFn,
    onMutate: async (variables) => {
      const queryKey = config.queryKey(variables);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<TData>(queryKey);
      queryClient.setQueryData<TData>(queryKey, (old) => config.updateData(old, variables));
      return { previousData, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
    },
    onSettled: (_data, _error, variables, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      config.invalidateKeys?.(variables).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    ...config.options,
  });
}

export function patchListItemById<T extends { id?: string | number }>(
  list: T[] | undefined,
  id: T["id"],
  patch: Partial<T>,
): T[] | undefined {
  if (!list) return list;
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function patchListItemsByIds<T extends { id?: string | number }>(
  list: T[] | undefined,
  ids: T["id"][],
  patch: Partial<T>,
): T[] | undefined {
  if (!list) return list;
  const idSet = new Set(ids);
  return list.map((item) => (idSet.has(item.id) ? { ...item, ...patch } : item));
}
