import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Button } from '../ui/Button';
import { MessageCircle, Heart, Share2, Search, PlusCircle, CornerDownRight, ChevronsDown } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { API_ENDPOINTS } from '../utils/config';

const formatRelativeTime = (isoString) => {
    const now = new Date();
    const date = new Date(isoString);
    const seconds = Math.floor((now - date) / 1000);
  
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
  
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
  
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
  
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
  
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
  
    return Math.floor(seconds) + "s ago";
};

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'Safety', value: 'safety' },
  { label: 'Market', value: 'market' },
  { label: 'Agent Reviews', value: 'agent' },
  { label: 'Property Reviews', value: 'property' },
];

const CATEGORIES = [
  { label: 'Safety', value: 'safety' },
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'Market', value: 'market' },
  { label: 'Agent Reviews', value: 'agent' },
  { label: 'Property Reviews', value: 'property' },
  { label: 'Other', value: 'other' },
];

const Comment = ({ comment, postId, onReply, onLike }) => {
    const [isReplying, setIsReplying] = useState(false);
    const [showReplies, setShowReplies] = useState(false);
    const [replyText, setReplyText] = useState('');

    const handleReplySubmit = () => {
        if (replyText.trim()) {
            onReply(postId, replyText, comment.id);
            setReplyText('');
            setIsReplying(false);
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex items-start gap-2">
                <span className="bg-gray-200 rounded-full w-7 h-7 flex items-center justify-center font-bold text-gray-500 flex-shrink-0">{comment.author?.[0] || '?'}</span>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-xs">{comment.author}</span>
                        <span className="text-xs text-gray-400">{formatRelativeTime(comment.timestamp)}</span>
                    </div>
                    <div className="text-gray-800 mb-1 text-sm">{comment.content}</div>
                    <div className="flex gap-4 text-xs text-gray-500 items-center">
                        <button onClick={() => onLike(postId, comment.id)} className={`flex items-center gap-1 hover:text-pink-600 ${comment.liked ? 'text-pink-600' : ''}`}>
                            <Heart className="w-3 h-3" /> {comment.likes} Like
                        </button>
                        <button onClick={() => setIsReplying(!isReplying)} className="flex items-center gap-1 hover:text-blue-600">
                            <CornerDownRight className="w-3 h-3" /> Reply
                        </button>
                    </div>

                    {isReplying && (
                        <div className="flex gap-2 mt-2">
                            <input
                                type="text"
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                className="flex-1 px-3 py-1 rounded-full border border-gray-200 text-sm"
                                placeholder={`Reply to ${comment.author}...`}
                            />
                            <Button onClick={handleReplySubmit} className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs">Send</Button>
                        </div>
                    )}
                </div>
            </div>
            
            {comment.replies && comment.replies.length > 0 && (
                <div className="mt-2 ml-4">
                    <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1 text-xs text-blue-600 font-semibold mb-2">
                        <ChevronsDown className={`w-3 h-3 transition-transform ${showReplies ? 'rotate-180' : ''}`} />
                        {showReplies ? 'Hide Replies' : `${comment.replies.length} ${comment.replies.length > 1 ? 'Replies' : 'Reply'}`}
                    </button>
                    {showReplies && (
                         <div className="ml-5 mt-2 border-l-2 border-gray-200 pl-3 space-y-3">
                            {comment.replies.map(reply => (
                                <Comment key={reply.id} comment={reply} postId={postId} onReply={onReply} onLike={onLike} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const Community = () => {
  const { currentUser } = useContext(AuthContext);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [allPosts, setAllPosts] = useState([]); // Full data from backend
  const [posts, setPosts] = useState([]); // What's shown on screen
  const [likeLoading, setLikeLoading] = useState(null);
  const [commentText, setCommentText] = useState({});
  const [showPostForm, setShowPostForm] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [posting, setPosting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [activePostId, setActivePostId] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editCategories, setEditCategories] = useState([]);

  const fetchPosts = () => {
    const url = `${API_ENDPOINTS.COMMUNITY_POSTS}${currentUser ? `?user_id=${currentUser.id}` : ''}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch community posts');
        return res.json();
      })
      .then(data => {
        setAllPosts(data.posts);
        setPosts(data.posts);
      })
      .catch(err => {
        console.error("❌ Failed to load community posts:", err);
        // Optionally show a user-friendly error message
      });
  };
  
  // Fetch posts from backend on mount
  useEffect(() => {
    fetchPosts();
  }, [currentUser]);

  // Combined filter for search and category
  useEffect(() => {
    const timeout = setTimeout(() => {
        let filteredPosts = allPosts;

        // Apply category filter first
        if (filter !== 'all') {
          filteredPosts = filteredPosts.filter(post =>
            Array.isArray(post.category) && post.category.includes(filter)
          );
        }

        // Then apply search filter to the result
        if (search) {
          filteredPosts = filteredPosts.filter(
            p =>
              p.content.toLowerCase().includes(search.toLowerCase()) ||
              (p.replies || []).some(r => r.content.toLowerCase().includes(search.toLowerCase()))
          );
        }

        setPosts(filteredPosts);
    }, 300); // Debounce search input

    return () => clearTimeout(timeout);
  }, [search, filter, allPosts]);

  // Like handler
  const handleLike = async (postId) => {
    setLikeLoading(postId);
  
    try {
      const res = await fetch(API_ENDPOINTS.COMMUNITY_LIKE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // important for session
        body: JSON.stringify({ post_id: postId, user_id: currentUser?.id })
      });
  
      const data = await res.json();
      if (data.success) {
        setPosts(posts =>
          posts.map(p =>
            p.id === postId
              ? {
                  ...p,
                  liked: data.liked,
                  likes: data.liked ? p.likes + 1 : p.likes - 1
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error("❌ Like failed:", err);
    } finally {
      setLikeLoading(null);
    }
  };

  const handleCommentLike = async (postId, commentId) => {
    // Optimistic UI update
    setPosts(posts => posts.map(p => {
        if (p.id !== postId) return p;
        return {
            ...p,
            replies: p.replies.map(r => {
                if (r.id !== commentId) return r;
                const newLikedStatus = !r.liked;
                return {
                    ...r,
                    liked: newLikedStatus,
                    likes: newLikedStatus ? r.likes + 1 : r.likes - 1
                };
            })
        };
    }));

    try {
        await fetch(API_ENDPOINTS.COMMUNITY_COMMENT_LIKE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ comment_id: commentId, user_id: currentUser?.id })
        });
        // No need to re-fetch, optimistic update is enough for UI
    } catch (err) {
        console.error("❌ Comment Like failed:", err);
        fetchPosts(); // Re-fetch to sync with server on error
    }
  };

  // Comment handler
  const handleComment = async (postId, content, parentCommentId = null) => {
    if (!content?.trim()) return;
  
    try {
      const res = await fetch(API_ENDPOINTS.COMMUNITY_COMMENT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          post_id: postId,
          content,
          parent_comment_id: parentCommentId,
          user_id: currentUser?.id
        })
      });
  
      const data = await res.json();
      if (res.ok && data.comment) {
        // Update the post in local state to include the new comment
        setPosts(posts => posts.map(post =>
          post.id === postId
            ? {
                ...post,
                replies: parentCommentId
                  ? post.replies.map(reply =>
                      reply.id === parentCommentId
                        ? { ...reply, replies: [...(reply.replies || []), data.comment] }
                        : reply
                    )
                  : [...(post.replies || []), data.comment],
                comments: post.comments + 1
              }
            : post
        ));
      }
    } catch (err) {
      console.error("❌ Failed to post comment:", err);
    }
  };

  // Post new thread
  const handleNewPost = async (e) => {
    e.preventDefault();
    if (!newPostContent.trim() || selectedCategories.length === 0) return;
    setPosting(true);
    try {
      await fetch(API_ENDPOINTS.COMMUNITY_POST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newPostContent,
          category: selectedCategories,
          user_id: currentUser?.id
        }),
        credentials: 'include',
      });

      // Re-fetch real posts
      const res = await fetch(API_ENDPOINTS.COMMUNITY);
      const data = await res.json();
      setAllPosts(data.posts);
      setPosts(data.posts);
    } catch (err) {
      console.error("❌ Failed to post:", err);
    } finally {
      setShowPostForm(false);
      setNewPostContent('');
      setSelectedCategories([]);
      setPosting(false);
    }
  };

  // Add edit and delete handlers
  const handleEdit = (postId) => {
    const post = posts.find(p => p.id === postId);
    if (post) {
      setEditingPost(post);
      setEditContent(post.content);
      setEditCategories(Array.isArray(post.category) ? post.category : [post.category].filter(Boolean));
      setDropdownOpen(null); // Close dropdown
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editContent.trim() || editCategories.length === 0) return;
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const token = session?.access_token;
      
      await fetch(API_ENDPOINTS.COMMUNITY_POST_EDIT(editingPost.id), {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ 
          content: editContent,
          category: editCategories 
        }),
      });
      
      // Update UI
      setPosts(posts.map(p => 
        p.id === editingPost.id 
          ? { ...p, content: editContent, category: editCategories }
          : p
      ));
      
      // Reset edit state
      setEditingPost(null);
      setEditContent('');
      setEditCategories([]);
    } catch (err) {
      console.error("❌ Failed to edit post:", err);
    }
  };

  const handleEditCancel = () => {
    setEditingPost(null);
    setEditContent('');
    setEditCategories([]);
  };

  const handleDelete = async (postId) => {
    if (confirm('Are you sure you want to delete this post?')) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        const token = session?.access_token;
        
        await fetch(API_ENDPOINTS.COMMUNITY_POST_DELETE(postId), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
        });
        // Update UI
        setPosts(posts.filter(p => p.id !== postId));
      } catch (err) {
        console.error("❌ Failed to delete post:", err);
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-blue-50 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Button onClick={() => setShowPostForm(v => !v)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full shadow">
            <PlusCircle className="w-5 h-5" /> Start a Discussion
          </Button>
        </div>

        {showPostForm && (
          <form onSubmit={handleNewPost} className="mb-8 bg-gray-50 p-4 rounded-xl shadow flex flex-col gap-3">
            <textarea
              className="w-full p-2 rounded border border-gray-200 focus:ring-2 focus:ring-blue-400"
              rows={3}
              placeholder="What's on your mind?"
              value={newPostContent}
              onChange={e => setNewPostContent(e.target.value)}
              required
            />
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <label key={cat.value} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat.value)}
                    onChange={e =>
                      setSelectedCategories(prev =>
                        e.target.checked
                          ? [...prev, cat.value]
                          : prev.filter(c => c !== cat.value)
                      )
                    }
                  />
                  {cat.label}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={posting || selectedCategories.length === 0} className="bg-blue-600 text-white px-6 py-2 rounded-full shadow">
              {posting ? 'Posting...' : 'Post'}
            </Button>
          </form>
        )}

        {/* Edit Post Modal */}
        {editingPost && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Edit Post</h3>
                <button onClick={handleEditCancel} className="text-gray-500 hover:text-gray-700">
                  <span className="text-2xl">&times;</span>
                </button>
              </div>
              
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <textarea
                  className="w-full p-3 rounded border border-gray-200 focus:ring-2 focus:ring-blue-400 resize-none"
                  rows={4}
                  placeholder="What's on your mind?"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  required
                />
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Categories:</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(cat => (
                      <label key={cat.value} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200">
                        <input
                          type="checkbox"
                          checked={editCategories.includes(cat.value)}
                          onChange={e =>
                            setEditCategories(prev =>
                              e.target.checked
                                ? [...prev, cat.value]
                                : prev.filter(c => c !== cat.value)
                            )
                          }
                        />
                        <span className="text-sm">{cat.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={editContent.trim() === '' || editCategories.length === 0}
                    className="flex-1 bg-blue-600 text-white px-6 py-2 rounded-full shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Update Post
                  </button>
                  <button
                    type="button"
                    onClick={handleEditCancel}
                    className="flex-1 bg-gray-300 text-gray-700 px-6 py-2 rounded-full shadow hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <span className="bg-blue-700 text-white p-2 rounded-full"><MessageCircle className="w-6 h-6" /></span>
            <h2 className="text-xl font-bold">Community Insights</h2>
            <span className="ml-2 bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Active Now</span>
          </div>
          <div className="relative w-full md:w-auto flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search discussions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 text-sm"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 border-b pb-2 overflow-x-auto">
          {FILTERS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 font-semibold rounded-t ${filter === tab.value ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-blue-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Posts Feed */}
        <div className="space-y-8">
          {posts.length > 0 ? posts.map(post => (
            <div key={post.id} className="bg-gray-50 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-500">{post.author?.[0] || '?'}</span>
                <span className="font-semibold text-gray-900 text-sm">{post.author}</span>
                <span className="text-xs text-gray-400 ml-2">{formatRelativeTime(post.timestamp)}</span>
                {currentUser && !currentUser.is_agent && post.author_id === currentUser?.id && (
                  <div className="ml-auto relative">
                    <Button onClick={() => setDropdownOpen(dropdownOpen === post.id ? null : post.id)} className="text-gray-500">...</Button>
                    {dropdownOpen === post.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
                        <Button onClick={() => handleEdit(post.id)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Edit</Button>
                        <Button onClick={() => handleDelete(post.id)} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100">Delete</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="text-gray-800 mb-3 text-sm md:text-base">{post.content}</div>
              <div className="flex gap-6 text-xs text-gray-500 items-center mb-2">
                <button onClick={() => setActivePostId(activePostId === post.id ? null : post.id)} className="flex items-center gap-1 hover:text-blue-600">
                  <MessageCircle className="w-4 h-4" /> {post.comments} Comment
                </button>
                <button onClick={() => handleLike(post.id)} className={`flex items-center gap-1 hover:text-pink-600 ${post.liked ? 'text-pink-600' : ''}`} disabled={likeLoading === post.id}>
                  <Heart className="w-4 h-4" /> {post.likes} Like
                </button>
                <button className="flex items-center gap-1 hover:text-blue-600">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              </div>

              {activePostId === post.id && (
                <div className="mt-4">
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={commentText[post.id] || ''}
                      onChange={e => setCommentText({ ...commentText, [post.id]: e.target.value })}
                      className="flex-1 px-3 py-1 rounded-full border border-gray-200 text-sm"
                      placeholder="Write a reply..."
                    />
                    <Button onClick={() => handleComment(post.id, commentText[post.id])} className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm">Reply</Button>
                  </div>

                  {(post.replies || []).length > 0 && (
                    <div className="ml-4 border-l-2 border-gray-200 pl-4 space-y-4">
                      {post.replies.map(reply => (
                          <Comment key={reply.id} comment={reply} postId={post.id} onReply={handleComment} onLike={handleCommentLike} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )) : (
            <p className="text-center text-gray-500">No discussions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Community;
 