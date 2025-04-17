import express from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = express.Router();

router.post('/register', AuthController.register);
router.get('/google', AuthController.googleAuth);
router.get('/google/callback', AuthController.googleCallback);

export const authRouter = router; 