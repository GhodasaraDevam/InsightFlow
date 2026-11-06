
import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async (): Promise<void> => {
    try {
        await connectDatabase();

        app.listen(PORT, () => {
            console.log(
                `InsightFlow backend running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("Failed to start InsightFlow:", error);
        process.exit(1);
    }
};

void startServer();
