/**
 * src/routes/livestock.routes.ts
 */

import { Router } from 'express';
import {
  registerLivestock,
  getMyKraal,
  getLivestockById,
  updateLivestock,
} from '../controllers/livestock.controller';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { expensiveOpLimiter } from '../middleware/rateLimiter';

const router = Router();

// All livestock routes require authentication
router.use(requireAuth);

/**
 * @route  POST /api/livestock/register
 * @desc   Register a new livestock asset and trigger the oracle appraisal
 * @access Private (FARMER | ADMIN)
 * @body   { animalId, type, breed, weightKg, ageMonths, healthStatus, imageUrl?, location? }
 */
router.post('/register', requireRole('FARMER', 'ADMIN'), expensiveOpLimiter, registerLivestock);

/**
 * @route  GET /api/livestock/my-kraal
 * @desc   Get all of the authenticated farmer's livestock
 * @access Private
 * @query  all=true — include PENDING/REJECTED records
 */
router.get('/my-kraal', getMyKraal);

/**
 * @route  GET /api/livestock/:id
 * @desc   Get a single livestock record by internal ID
 * @access Private
 */
router.get('/:id', getLivestockById);

/**
 * @route  PATCH /api/livestock/:id
 * @desc   Update livestock metadata (owner: imageUrl/location; admin: verificationStatus)
 * @access Private
 */
router.patch('/:id', updateLivestock);

export default router;
