import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sql from './db';
import coverageRouter from './routes/coverage';
import routeSuggestionRouter from './routes/routeSuggestion';
import gpxExportRouter from './routes/gpxExport';
import roadsRouter from './routes/roads';
import walksRouter from './routes/walks';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check — verifies DB connectivity
app.get('/health', async (_req, res) => {
  try {
    const [result] = await sql`SELECT PostGIS_version() AS postgis_version`;
    res.json({
      status: 'ok',
      postgis: result.postgis_version,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'Database unreachable' });
  }
});

app.use('/api/coverage', coverageRouter);
app.use('/api/routes', routeSuggestionRouter);
app.use('/api/gpx', gpxExportRouter);
app.use('/api/roads', roadsRouter);
app.use('/api/walks', walksRouter);

app.listen(PORT, () => {
  console.log(`Fresh Steps API running on port ${PORT}`);
});
