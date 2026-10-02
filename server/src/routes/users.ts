import { Router } from "express";
import { requireAuthentication } from "../middleware/authenticate";

export const usersRouter = Router();

usersRouter.get("/me", requireAuthentication, (request, response) => {
  const user = request.auth!;
  response.status(200).json({
    data: {
      id: user.userId,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    },
  });
});
