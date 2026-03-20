export const tableWrapper = (theme: any) => ({
  '& .MuiTableCell-root.MuiTableCell-footer': {
    paddingX: theme.spacing(8),
    paddingY: theme.spacing(4),
  }
})

export const paginationStyle = (theme: any) => ({
  mt: theme.spacing(6),
  color: theme.palette.text.secondary,
  "& .MuiSelect-icon": {
    width: "24px",
    height: "fit-content",
  },
  "& .MuiSelect-select": {
    width: theme.spacing(10),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.border.light}`,
    padding: theme.spacing(4),
  },
});

export const paginationSelect = (theme: any) => ({
  ml: theme.spacing(4),
  mr: theme.spacing(12),
  minWidth: theme.spacing(20),
  textAlign: "left",
  "&.Mui-focused > div": {
    backgroundColor: theme.palette.background.main,
  },
});

export const paginationDropdown = (theme: any) => ({
  mt: 0,
  mb: theme.spacing(2)
})

export const paginationWrapper = (theme: any) => ({
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingX: theme.spacing(4),
  "& p": {
    color: theme.palette.text.tertiary,
  },
})

export const emptyData = (theme: any) => ({
  padding: theme.spacing(15, 5),
  paddingBottom: theme.spacing(20),
})

export const styles = {
  textBase: {
    fontSize: "13px",
    color: "text.tertiary"
  }
}



