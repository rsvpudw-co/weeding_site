import express from "express";
import { guestController } from "../controllers/guestController.js";

const router = express.Router();

const rawIdCardParser = express.raw({
  type: ["multipart/form-data", "image/*", "application/pdf", "application/x-pdf", "application/octet-stream"],
  limit: "25mb",
});

// Specific routes before parameterized :id route
router.get("/stats", guestController.getStats);
router.get("/export/csv", guestController.exportCsv);
router.post("/sync", guestController.syncGuests);
router.post("/bulk-import", guestController.bulkImportGuests);

// ID Card binary storage routes (Photos & PDFs stored in PostgreSQL BYTEA)
router.get("/:id/id-card", guestController.getGuestIdCard);
router.post("/:id/id-card", rawIdCardParser, guestController.uploadGuestIdCard);
router.put("/:id/id-card", rawIdCardParser, guestController.uploadGuestIdCard);
router.delete("/:id/id-card", guestController.deleteGuestIdCard);

// CRUD routes
router.get("/", guestController.getGuests);
router.get("/:id", guestController.getGuestById);
router.post("/", guestController.createGuest);
router.put("/:id", guestController.updateGuest);
router.delete("/:id", guestController.deleteGuest);

export default router;
