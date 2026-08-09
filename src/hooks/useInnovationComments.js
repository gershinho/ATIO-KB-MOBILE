import { useCallback, useEffect, useState } from 'react';
import { addCommentToInnovation, getCommentsForInnovation } from '../database/engagement';
import { createLogger } from '../utils/logger';

const log = createLogger('comments');

/**
 * The comment list for one innovation, and posting to it.
 *
 * Lifted out of CommentsModal, which reached into database/engagement itself.
 * hooks/ is the data-access layer for screens and components; keeping this here
 * means the modal is presentational and the load-then-repost-then-reload
 * sequence has one owner.
 *
 * @param {object|null} innovation
 * @param {boolean} visible - nothing loads until the modal is open
 * @returns {{comments: Array, loading: boolean, submitting: boolean,
 *   submitError: string|null, submit: (name: string, body: string) => Promise<boolean>}}
 *   `submit` resolves true when the comment was stored.
 */
export default function useInnovationComments(innovation, visible) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!visible || !innovation) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await getCommentsForInnovation(innovation.id);
        if (!cancelled) setComments(list);
      } catch (e) {
        log.failed('Could not load comments:', e);
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Keyed on the innovation's id rather than the object: the parent hands down
    // a freshly built object whenever the comment count changes, and re-fetching
    // the list in response to having just posted to it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [visible, innovation?.id]);

  const submit = useCallback(
    async (name, body) => {
      if (!innovation) return false;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const saved = await addCommentToInnovation(innovation.id, name, body);
        if (!saved) {
          // addCommentToInnovation rejects blank input without writing. It used
          // to return undefined either way, so a discarded comment looked
          // identical to a saved one and the text box just sat there.
          setSubmitError('Comment could not be saved. Check the name and message.');
          return false;
        }
        setComments(await getCommentsForInnovation(innovation.id));
        return true;
      } catch (e) {
        log.failed('Could not post the comment:', e);
        setSubmitError('Comment could not be saved. Please try again.');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [innovation]
  );

  return { comments, loading, submitting, submitError, submit };
}
