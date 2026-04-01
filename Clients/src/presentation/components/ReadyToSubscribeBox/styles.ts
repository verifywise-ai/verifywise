import { Theme } from "@mui/material";
import { text, background } from "../../themes/palette";

// Define styles as constants to improve readability and reusability
const getStyles = (theme: Theme) => ({
    container: {
        width: '90%',
        backgroundColor: '#28A745',
        borderRadius: '4px'
    },
    stack: {
        padding: '15px'
    },
    title: {
        fontWeight: 600,
        fontSize: '16px',
        lineHeight: '24px',
        letterSpacing: '0%',
        color: `${background.main}`,
    },
    description: {
        fontWeight: 400,
        fontSize: '13px',
        lineHeight: '20px',
        letterSpacing: '0%',
        color: `${background.main}`,
    },
    button: {
        border: '1px solid #A1A1A1',
        backgroundColor: theme.palette.background.main,
        color: `${text.secondary}`,
        padding: '4px',
        borderRadius: '4px'
    }
});

export default getStyles;